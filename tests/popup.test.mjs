import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRun } from '../src/popup/popup.js';

test('buildRun disables an invalid fallback configuration', () => {
  const result = buildRun({
    openingAt: '2026-08-10T09:00',
    leadMinutes: '3',
    courses: [{ code: 'CT112', primary: '01', fallbacks: '01, 02' }],
  });

  assert.deepEqual(result, { ok: false, error: 'FALLBACK_DUPLICATES_PRIMARY' });
});

test('buildRun normalizes fallback group input', () => {
  const result = buildRun({
    openingAt: '2026-08-10T09:00',
    leadMinutes: '3',
    courses: [{ code: 'ct112', primary: '01', fallbacks: ' 02, 03 ' }],
  });

  assert.deepEqual(result, {
    ok: true,
    run: {
      openingAt: '2026-08-10T09:00:00+07:00',
      leadMinutes: 3,
      courses: [{ code: 'CT112', primary: '01', fallbacks: ['02', '03'] }],
    },
  });
});
