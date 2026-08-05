(() => {
  const DEFAULT_SPIN_WINDOW_MS = 20;

  function scheduleTarget({ targetMs, nowMs, setTimeoutFn, clearTimeoutFn, spinWindowMs = DEFAULT_SPIN_WINDOW_MS, onFire }) {
    if (!Number.isFinite(targetMs) || !Number.isFinite(spinWindowMs) || spinWindowMs <= 0) {
      return { ok: false, error: 'PRECISION_DEADLINE_INVALID' };
    }

    const armedMs = nowMs();
    const remainingMs = targetMs - armedMs;
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
      while (!cancelled && nowMs() < targetMs) {
        // Keep the last window on the page thread so no timer turn is added.
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

  globalThis.CtuPrecisionScheduler = Object.freeze({ scheduleTarget });
})();
