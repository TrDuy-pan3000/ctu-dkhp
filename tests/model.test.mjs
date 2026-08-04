import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { validateRun } from '../src/shared/model.js';

test('rejects duplicated primary and fallback groups', () => {
  const result = validateRun({
    openingAt: '2026-08-10T09:00:00+07:00',
    courses: [{ code: 'CT112', primary: '01', fallbacks: ['01'] }],
  });

  assert.deepEqual(result, { ok: false, error: 'FALLBACK_DUPLICATES_PRIMARY' });
});

test('declares only existing extension entry points', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const entryPoints = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((script) => script.js),
  ];

  for (const entryPoint of entryPoints) {
    assert.equal(existsSync(new URL(`../${entryPoint}`, import.meta.url)), true, entryPoint);
  }
});
