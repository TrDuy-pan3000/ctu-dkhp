import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateOffset, validateClockQuorum } from '../src/shared/clock.js';

test('uses median offset after excluding a high-latency sample', () => {
  const result = estimateOffset([
    { offsetMs: 11, rttMs: 30 },
    { offsetMs: 13, rttMs: 40 },
    { offsetMs: 500, rttMs: 1_900 },
  ]);

  assert.deepEqual(result, { ok: true, offsetMs: 12 });
});

test('rejects a clock estimate without a two-source quorum', () => {
  assert.deepEqual(estimateOffset([{ offsetMs: 10, rttMs: 20 }]), {
    ok: false,
    error: 'CLOCK_QUORUM_FAILED',
  });
});

test('keeps a two-source majority when one network clock is stale', () => {
  assert.deepEqual(validateClockQuorum([
    { offsetMs: 120, rttMs: 600, source: 'google' },
    { offsetMs: 90, rttMs: 450, source: 'cloudflare' },
    { offsetMs: 1_200_000, rttMs: 700, source: 'stale-source' },
  ]), { ok: true, offsetMs: 105, sources: 2 });
});
