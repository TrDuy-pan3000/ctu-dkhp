import { RUN_STATES, validateRun } from '../shared/model.js';

export function createCoordinator(dependencies) {
  const sessions = new Map();
  const now = dependencies.now ?? Date.now;

  async function persist(session) {
    sessions.set(session.runId, session);
    await dependencies.save?.(session);
    return session;
  }

  async function arm(run) {
    const validation = validateRun(run);
    if (!validation.ok) {
      return validation;
    }

    const clock = await dependencies.clock?.();
    if (!clock?.ok) {
      return clock ?? { ok: false, error: 'CLOCK_QUORUM_FAILED' };
    }

    const openingAtMs = Date.parse(run.openingAt);
    if (!Number.isFinite(openingAtMs) || openingAtMs <= now()) {
      return { ok: false, error: 'OPENING_TIME_INVALID' };
    }

    const runId = dependencies.id?.() ?? crypto.randomUUID();
    const session = await persist({
      runId,
      run,
      state: RUN_STATES.ARMED,
      attempt: 0,
      preparedFingerprint: null,
      clockOffsetMs: clock.offsetMs,
    });
    const deadline = openingAtMs - clock.offsetMs;
    const preflightAt = deadline - run.leadMinutes * 60_000;
    await dependencies.createAlarm(`preflight:${runId}`, { when: preflightAt });
    await dependencies.createAlarm(`submit:${runId}`, { when: deadline });
    return session;
  }

  async function handleAlarm(name) {
    const [kind, runId] = name.split(':');
    const session = sessions.get(runId);
    if (!session) {
      return { ok: false, error: 'RUN_NOT_FOUND' };
    }

    if (kind === 'preflight') {
      const next = await persist({ ...session, state: RUN_STATES.PREFLIGHT });
      await dependencies.send?.({ type: 'PREPARE', runId, courses: primaryCourses(next.run) });
      return { ok: true, state: next.state };
    }

    if (kind === 'submit') {
      if (session.state !== RUN_STATES.PREPARED || !session.preparedFingerprint) {
        return { ok: false, error: 'RUN_NOT_PREPARED' };
      }
      const next = await persist({ ...session, state: RUN_STATES.SUBMITTING_PRIMARY });
      await dependencies.send?.({ type: 'SUBMIT', runId, courses: next.preparedFingerprint, dryRun: next.run.dryRun === true });
      return { ok: true, state: next.state };
    }

    return { ok: false, error: 'ALARM_UNKNOWN' };
  }

  async function acceptPrepared(runId, prepared) {
    const session = sessions.get(runId);
    if (!session || session.state !== RUN_STATES.PREFLIGHT) {
      return { ok: false, error: 'PREPARE_OUT_OF_SEQUENCE' };
    }

    const expected = primaryCourses(session.run);
    if (!sameCourses(expected, prepared)) {
      return { ok: false, error: 'PREPARED_FINGERPRINT_MISMATCH' };
    }

    const next = await persist({ ...session, state: RUN_STATES.PREPARED, preparedFingerprint: prepared });
    return { ok: true, state: next.state };
  }

  function restore(session) {
    sessions.set(session.runId, session);
  }

  return { acceptPrepared, arm, handleAlarm, restore };
}

function primaryCourses(run) {
  return run.courses.map(({ code, primary }) => ({ code, group: primary }));
}

function sameCourses(expected, actual) {
  return Array.isArray(actual) && expected.length === actual.length
    && expected.every((course, index) => course.code === actual[index].code && course.group === actual[index].group);
}
