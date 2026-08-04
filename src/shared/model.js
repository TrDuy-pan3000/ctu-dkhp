export const RUN_STATES = Object.freeze({
  DRAFT: 'draft',
  ARMED: 'armed',
  PREFLIGHT: 'preflight',
  PREPARED: 'prepared',
  SUBMITTING_PRIMARY: 'submitting-primary',
  PRIMARY_REJECTED: 'primary-rejected',
  FALLBACK_PREPARING: 'fallback-preparing',
  FALLBACK_SUBMITTING: 'fallback-submitting',
  VERIFIED_SUCCESS: 'verified-success',
  PREFLIGHT_FAILED: 'preflight-failed',
  MANUAL_ATTENTION: 'manual-attention',
});

export const DEFAULT_RUN = Object.freeze({
  openingAt: '',
  leadMinutes: 3,
  courses: [],
  armed: false,
});

const COURSE_CODE = /^[A-Z]{2,}\d+$/;
const GROUP = /^\d{2}$/;

export function validateRun(run) {
  if (!run?.openingAt || !Array.isArray(run.courses) || run.courses.length === 0) {
    return { ok: false, error: 'RUN_INCOMPLETE' };
  }

  const codes = new Set();
  for (const course of run.courses) {
    if (!COURSE_CODE.test(course.code) || codes.has(course.code) || !GROUP.test(course.primary)) {
      return { ok: false, error: 'COURSE_INVALID' };
    }

    codes.add(course.code);
    if ((course.fallbacks ?? []).includes(course.primary)) {
      return { ok: false, error: 'FALLBACK_DUPLICATES_PRIMARY' };
    }
  }

  return { ok: true };
}
