import test from 'node:test';
import assert from 'node:assert/strict';

import { computeRemainingMs, scheduleTarget } from '../src/shared/precision-scheduler.js';

test('computes signed remaining time', () => {
  assert.equal(computeRemainingMs(1_000, 900), 100);
  assert.equal(computeRemainingMs(900, 1_000), -100);
});

test('rejects a target that is too close for the final spin window', () => {
  assert.deepEqual(scheduleTarget({
    targetMs: 105,
    nowMs: () => 100,
    spinWindowMs: 20,
    setTimeoutFn: () => { throw new Error('should not arm'); },
    onFire: () => {},
  }), { ok: false, error: 'PRECISION_ARM_TOO_LATE', remainingMs: 5 });
});

test('uses a coarse timeout then fires at the monotonic target', () => {
  let timer;
  let now = 0;
  let fired;
  const result = scheduleTarget({
    targetMs: 100,
    nowMs: () => now,
    spinWindowMs: 20,
    setTimeoutFn: (callback, delay) => {
      timer = { callback, delay };
      return 1;
    },
    clearTimeoutFn: () => {},
    onFire: (event) => { fired = event; },
  });

  assert.equal(result.ok, true);
  assert.equal(timer.delay, 80);
  now = 100;
  timer.callback();
  assert.deepEqual(fired, { targetMs: 100, firedMs: 100, latenessMs: 0 });
});

test('cancel prevents the callback from firing', () => {
  let timer;
  let fired = false;
  const result = scheduleTarget({
    targetMs: 100,
    nowMs: () => 0,
    setTimeoutFn: (callback) => { timer = callback; return 1; },
    clearTimeoutFn: () => {},
    onFire: () => { fired = true; },
  });
  result.cancel();
  timer();
  assert.equal(fired, false);
});
