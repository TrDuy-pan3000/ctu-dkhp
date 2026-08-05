import test from 'node:test';
import assert from 'node:assert/strict';

import { createCoordinator } from '../src/background/coordinator.js';

const run = {
  openingAt: '2026-08-10T09:00:00+07:00',
  leadMinutes: 3,
  courses: [{ code: 'CT112', primary: '01', fallbacks: ['02'] }],
};

test('arming creates preflight and submission alarms', async () => {
  const alarms = [];
  const coordinator = createCoordinator({
    createAlarm: async (name, info) => alarms.push({ name, info }),
    clock: async () => ({ ok: true, offsetMs: 0 }),
    now: () => Date.parse('2026-08-10T08:00:00+07:00'),
    save: async () => {},
    id: () => 'run-1',
  });

  const session = await coordinator.arm(run);

  assert.equal(session.state, 'armed');
  assert.deepEqual(alarms.map(({ name }) => name), ['preflight:run-1', 'submit:run-1']);
  assert.equal(alarms[0].info.when, Date.parse(run.openingAt) - 180000);
});

test('never sends a submit command before prepared fingerprint confirmation', async () => {
  const commands = [];
  const coordinator = createCoordinator({
    createAlarm: async () => {},
    clock: async () => ({ ok: true, offsetMs: 0 }),
    now: () => 0,
    save: async () => {},
    send: async (command) => commands.push(command),
    id: () => 'run-1',
  });

  await coordinator.arm(run);
  const result = await coordinator.handleAlarm('submit:run-1');

  assert.deepEqual(result, { ok: false, error: 'RUN_NOT_PREPARED' });
  assert.deepEqual(commands, []);
});

test('restores a prepared session before its submission alarm fires', async () => {
  const commands = [];
  const coordinator = createCoordinator({
    createAlarm: async () => {},
    clock: async () => ({ ok: true, offsetMs: 0 }),
    save: async () => {},
    send: async (command) => commands.push(command),
  });

  coordinator.restore({
    runId: 'run-1',
    run,
    state: 'prepared',
    attempt: 0,
    preparedFingerprint: [{ code: 'CT112', group: '01' }],
  });
  await coordinator.handleAlarm('submit:run-1');

  assert.equal(commands[0].type, 'SUBMIT');
  assert.equal(commands[0].courses[0].group, '01');
});

test('refuses to arm when network clock quorum fails', async () => {
  const alarms = [];
  const coordinator = createCoordinator({
    createAlarm: async (...args) => alarms.push(args),
    clock: async () => ({ ok: false, error: 'CLOCK_QUORUM_FAILED' }),
    now: () => 0,
    save: async () => {},
  });

  assert.deepEqual(await coordinator.arm(run), { ok: false, error: 'CLOCK_QUORUM_FAILED' });
  assert.deepEqual(alarms, []);
});

test('disarming removes both run alarms and the persisted session', async () => {
  const cleared = [];
  let erased = false;
  const coordinator = createCoordinator({
    clearAlarm: async (name) => cleared.push(name),
    clearSaved: async () => { erased = true; },
    clock: async () => ({ ok: true, offsetMs: 0 }),
    createAlarm: async () => {},
    now: () => 0,
    save: async () => {},
    id: () => 'run-1',
  });

  await coordinator.arm(run);
  assert.deepEqual(await coordinator.disarm('run-1'), { ok: true });
  assert.deepEqual(cleared, ['preflight:run-1', 'submit:run-1']);
  assert.equal(erased, true);
});

test('prepares the next user-configured fallback only for a known full course', async () => {
  const commands = [];
  const coordinator = createCoordinator({
    createAlarm: async () => {},
    clock: async () => ({ ok: true, offsetMs: 0 }),
    now: () => 0,
    save: async () => {},
    send: async (command) => commands.push(command),
    id: () => 'run-1',
  });

  await coordinator.arm(run);
  await coordinator.handleAlarm('preflight:run-1');
  await coordinator.acceptPrepared('run-1', [{ code: 'CT112', group: '01' }]);
  await coordinator.handleAlarm('submit:run-1');
  const result = await coordinator.handleOutcome('run-1', { category: 'full', courseCode: 'CT112' });

  assert.deepEqual(result, { ok: true, state: 'fallback-preparing' });
  assert.deepEqual(commands.at(-1), {
    type: 'PREPARE',
    runId: 'run-1',
    courses: [{ code: 'CT112', group: '02' }],
  });
});

test('records a completed dry run without reporting a live registration', async () => {
  let saved;
  const coordinator = createCoordinator({
    createAlarm: async () => {},
    clock: async () => ({ ok: true, offsetMs: 0 }),
    now: () => 0,
    save: async (session) => { saved = session; },
    send: async () => {},
    id: () => 'run-1',
  });
  await coordinator.arm({ ...run, dryRun: true });
  await coordinator.handleAlarm('preflight:run-1');
  await coordinator.acceptPrepared('run-1', [{ code: 'CT112', group: '01' }]);
  await coordinator.handleAlarm('submit:run-1');
  await coordinator.handleOutcome('run-1', { category: 'success' });

  assert.equal(saved.lastResult, 'prepared-dry-run');
});
