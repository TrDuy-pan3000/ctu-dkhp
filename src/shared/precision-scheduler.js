export const DEFAULT_SPIN_WINDOW_MS = 20;

export function computeRemainingMs(targetMs, nowMs) {
  return targetMs - nowMs;
}

export function scheduleTarget({
  targetMs,
  nowMs = () => globalThis.performance.now(),
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
  spinWindowMs = DEFAULT_SPIN_WINDOW_MS,
  onFire,
}) {
  if (!Number.isFinite(targetMs) || !Number.isFinite(spinWindowMs) || spinWindowMs <= 0) {
    return { ok: false, error: 'PRECISION_DEADLINE_INVALID' };
  }

  const armedMs = nowMs();
  const remainingMs = computeRemainingMs(targetMs, armedMs);
  if (!Number.isFinite(remainingMs)) {
    return { ok: false, error: 'PRECISION_DEADLINE_INVALID' };
  }
  if (remainingMs < spinWindowMs) {
    return { ok: false, error: 'PRECISION_ARM_TOO_LATE', remainingMs };
  }

  let cancelled = false;
  let timerId;

  function fire() {
    if (cancelled) return;

    const currentMs = nowMs();
    if (currentMs < targetMs - spinWindowMs) {
      timerId = setTimeoutFn(fire, Math.max(0, targetMs - currentMs - spinWindowMs));
      return;
    }

    // The final window intentionally runs without yielding so timer jitter cannot
    // add another event-loop turn before the button click.
    while (!cancelled && nowMs() < targetMs) {
      // Busy-wait is bounded by spinWindowMs and used only for the final window.
    }
    if (cancelled) return;

    const firedMs = nowMs();
    onFire({ targetMs, firedMs, latenessMs: firedMs - targetMs });
  }

  timerId = setTimeoutFn(fire, Math.max(0, remainingMs - spinWindowMs));
  return {
    ok: true,
    armedMs,
    cancel: () => {
      cancelled = true;
      if (timerId !== undefined) clearTimeoutFn(timerId);
    },
  };
}
