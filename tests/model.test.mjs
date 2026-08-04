import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRun } from '../src/shared/model.js';

test('rejects duplicated primary and fallback groups', () => {
  const result = validateRun({
    openingAt: '2026-08-10T09:00:00+07:00',
    courses: [{ code: 'CT112', primary: '01', fallbacks: ['01'] }],
  });

  assert.deepEqual(result, { ok: false, error: 'FALLBACK_DUPLICATES_PRIMARY' });
});
