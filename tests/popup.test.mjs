import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRun } from '../src/popup/popup.js';

test('buildRun creates a click-only schedule', () => {
  const result = buildRun({ openingAt: '2026-08-10T09:00', leadMinutes: '3' });

  assert.deepEqual(result, {
    ok: true,
    run: {
      openingAt: '2026-08-10T09:00:00+07:00',
      leadMinutes: 3,
      clickOnly: true,
      dryRun: false,
    },
  });
});

test('buildRun rejects an invalid lead time', () => {
  const result = buildRun({
    openingAt: '2026-08-10T09:00',
    leadMinutes: '0',
  });

  assert.deepEqual(result, { ok: false, error: 'LEAD_TIME_INVALID' });
});
