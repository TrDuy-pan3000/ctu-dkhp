import { RUN_STATES } from './model.js';

export function transition(session, event) {
  if (event.type !== 'OUTCOME') {
    return { ...session, state: RUN_STATES.MANUAL_ATTENTION, reason: 'UNEXPECTED_EVENT' };
  }

  if (event.category === 'success') {
    return { ...session, state: RUN_STATES.VERIFIED_SUCCESS };
  }

  if (event.category === 'full' && canUseFallback(session)) {
    return {
      ...session,
      state: RUN_STATES.FALLBACK_PREPARING,
      attempt: session.attempt + 1,
    };
  }

  return {
    state: RUN_STATES.MANUAL_ATTENTION,
    attempt: session.attempt,
    reason: event.category === 'full' ? 'FALLBACKS_EXHAUSTED' : 'AMBIGUOUS_OUTCOME',
  };
}

function canUseFallback(session) {
  const isSubmitting = session.state === RUN_STATES.SUBMITTING_PRIMARY
    || session.state === RUN_STATES.FALLBACK_SUBMITTING;
  return isSubmitting && Array.isArray(session.fallbacks)
    && session.fallbackIndex < session.fallbacks.length;
}
