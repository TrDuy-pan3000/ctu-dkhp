// Allow a cold service-worker request to complete while bounding midpoint error.
export const MAX_CLOCK_RTT_MS = 1_500;
export const MAX_CLOCK_DISAGREEMENT_MS = 1_500;

export function estimateOffset(samples) {
  const usable = samples
    .filter((sample) => Number.isFinite(sample.offsetMs) && Number.isFinite(sample.rttMs))
    .filter((sample) => sample.rttMs <= MAX_CLOCK_RTT_MS)
    .sort((left, right) => left.offsetMs - right.offsetMs);

  if (usable.length < 2) {
    return { ok: false, error: 'CLOCK_QUORUM_FAILED' };
  }

  const lower = usable[Math.floor((usable.length - 1) / 2)].offsetMs;
  const upper = usable[Math.ceil((usable.length - 1) / 2)].offsetMs;
  return { ok: true, offsetMs: Math.round((lower + upper) / 2) };
}

export function validateClockQuorum(samples) {
  const estimate = estimateOffset(samples);
  if (!estimate.ok) return estimate;

  const agreeing = samples.filter((sample) => Number.isFinite(sample.offsetMs)
    && Number.isFinite(sample.rttMs)
    && sample.rttMs <= MAX_CLOCK_RTT_MS
    && Math.abs(sample.offsetMs - estimate.offsetMs) <= MAX_CLOCK_DISAGREEMENT_MS);
  const offsets = agreeing.map((sample) => sample.offsetMs);
  const spread = Math.max(...offsets) - Math.min(...offsets);
  if (agreeing.length < 2 || spread > MAX_CLOCK_DISAGREEMENT_MS) {
    return { ok: false, error: 'CLOCK_QUORUM_FAILED' };
  }

  const majority = estimateOffset(agreeing);
  return { ok: true, offsetMs: majority.offsetMs, sources: agreeing.length };
}
