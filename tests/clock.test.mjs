import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateOffset } from '../src/shared/clock.js';

test('uses median offset after excluding a high-latency sample', () => {
  const result = estimateOffset([
    { offsetMs: 11, rttMs: 30 },
    { offsetMs: 13, rttMs: 40 },
    { offsetMs: 500, rttMs: 900 },
  ]);

  assert.deepEqual(result, { ok: true, offsetMs: 12 });
});

test('rejects a clock estimate without a two-source quorum', () => {
  assert.deepEqual(estimateOffset([{ offsetMs: 10, rttMs: 20 }]), {
    ok: false,
    error: 'CLOCK_QUORUM_FAILED',
  });
});
