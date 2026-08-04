export const MAX_CLOCK_RTT_MS = 250;

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
