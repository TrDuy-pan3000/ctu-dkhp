import test from 'node:test';
import assert from 'node:assert/strict';

import { transition } from '../src/shared/state-machine.js';

test('marks a primary submission successful only after a success outcome', () => {
  const result = transition({ state: 'submitting-primary', attempt: 0 }, { type: 'OUTCOME', category: 'success' });
  assert.equal(result.state, 'verified-success');
});

test('enters fallback preparation only after a full-capacity outcome with a fallback', () => {
  const result = transition(
    { state: 'submitting-primary', attempt: 0, fallbackIndex: 0, fallbacks: ['02'] },
    { type: 'OUTCOME', category: 'full' },
  );

  assert.deepEqual(result, { state: 'fallback-preparing', attempt: 1, fallbackIndex: 0, fallbacks: ['02'] });
});

test('stops on ambiguous rejection', () => {
  const result = transition({ state: 'submitting-primary', attempt: 0 }, { type: 'OUTCOME', category: 'ambiguous' });
  assert.deepEqual(result, { state: 'manual-attention', attempt: 0, reason: 'AMBIGUOUS_OUTCOME' });
});
