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
    if (!session || ![RUN_STATES.PREFLIGHT, RUN_STATES.FALLBACK_PREPARING].includes(session.state)) {
      return { ok: false, error: 'PREPARE_OUT_OF_SEQUENCE' };
    }

    const expected = session.nextCourses ?? primaryCourses(session.run);
    if (!sameCourses(expected, prepared)) {
      return { ok: false, error: 'PREPARED_FINGERPRINT_MISMATCH' };
    }

    const state = session.state === RUN_STATES.PREFLIGHT
      ? RUN_STATES.PREPARED
      : RUN_STATES.FALLBACK_SUBMITTING;
    const next = await persist({ ...session, state, preparedFingerprint: prepared, nextCourses: undefined });
    return { ok: true, state: next.state };
  }

  async function handleOutcome(runId, outcome) {
    const session = sessions.get(runId);
    if (!session || ![RUN_STATES.SUBMITTING_PRIMARY, RUN_STATES.FALLBACK_SUBMITTING].includes(session.state)) {
      return { ok: false, error: 'OUTCOME_OUT_OF_SEQUENCE' };
    }
    if (outcome.category === 'success') {
      const next = await persist({
        ...session,
        state: RUN_STATES.VERIFIED_SUCCESS,
        lastResult: session.run.dryRun ? 'prepared-dry-run' : 'verified-success',
      });
      return { ok: true, state: next.state };
    }
    if (outcome.category !== 'full' || !outcome.courseCode) {
      const next = await persist({ ...session, state: RUN_STATES.MANUAL_ATTENTION, reason: 'AMBIGUOUS_OUTCOME' });
      return { ok: false, error: next.reason };
    }

    const course = session.run.courses.find((item) => item.code === outcome.courseCode);
    const fallbackIndexes = { ...(session.fallbackIndexes ?? {}) };
    const fallbackIndex = fallbackIndexes[outcome.courseCode] ?? 0;
    const fallback = course?.fallbacks[fallbackIndex];
    if (!fallback) {
      const next = await persist({ ...session, state: RUN_STATES.MANUAL_ATTENTION, reason: 'FALLBACKS_EXHAUSTED' });
      return { ok: false, error: next.reason };
    }

    fallbackIndexes[outcome.courseCode] = fallbackIndex + 1;
    const nextCourses = session.preparedFingerprint.map((item) => item.code === outcome.courseCode
      ? { ...item, group: fallback }
      : item);
    const next = await persist({
      ...session,
      state: RUN_STATES.FALLBACK_PREPARING,
      attempt: session.attempt + 1,
      fallbackIndexes,
      nextCourses,
      preparedFingerprint: null,
    });
    await dependencies.send?.({ type: 'PREPARE', runId, courses: nextCourses });
    return { ok: true, state: next.state };
  }

  async function submitFallback(runId) {
    const session = sessions.get(runId);
    if (!session || session.state !== RUN_STATES.FALLBACK_SUBMITTING || !session.preparedFingerprint) {
      return { ok: false, error: 'FALLBACK_NOT_PREPARED' };
    }
    await dependencies.send?.({
      type: 'SUBMIT',
      runId,
      courses: session.preparedFingerprint,
      dryRun: session.run.dryRun === true,
    });
    return { ok: true };
  }

  function restore(session) {
    sessions.set(session.runId, session);
  }

  async function disarm(runId) {
    if (!sessions.has(runId)) {
      return { ok: false, error: 'RUN_NOT_FOUND' };
    }
    await dependencies.clearAlarm?.(`preflight:${runId}`);
    await dependencies.clearAlarm?.(`submit:${runId}`);
    sessions.delete(runId);
    await dependencies.clearSaved?.();
    return { ok: true };
  }

  return { acceptPrepared, arm, disarm, handleAlarm, handleOutcome, restore, submitFallback };
}

function primaryCourses(run) {
  return run.courses.map(({ code, primary }) => ({ code, group: primary }));
}

function sameCourses(expected, actual) {
  return Array.isArray(actual) && expected.length === actual.length
    && expected.every((course, index) => course.code === actual[index].code && course.group === actual[index].group);
}
