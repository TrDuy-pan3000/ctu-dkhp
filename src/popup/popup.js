import { validateRun } from '../shared/model.js';

export function buildRun(values) {
  const leadMinutes = Number(values.leadMinutes);
  const run = {
    openingAt: `${values.openingAt}:00+07:00`,
    leadMinutes,
    courses: values.courses.map((course) => ({
      code: course.code.trim().toUpperCase(),
      primary: course.primary.trim(),
      fallbacks: course.fallbacks.split(',').map((group) => group.trim()).filter(Boolean),
    })),
  };
  if (!Number.isInteger(leadMinutes) || leadMinutes < 1 || leadMinutes > 30) {
    return { ok: false, error: 'LEAD_TIME_INVALID' };
  }
  const validation = validateRun(run);
  return validation.ok ? { ok: true, run } : validation;
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#run-form');
  const list = document.querySelector('#course-list');
  const template = document.querySelector('#course-template');
  const status = document.querySelector('#status');

  addCourse();
  document.querySelector('#add-course').addEventListener('click', addCourse);
  form.addEventListener('submit', armRun);
  form.addEventListener('input', saveDraft);
  document.querySelector('#disarm').addEventListener('click', disarmRun);
  void restoreDraft();

  async function armRun(event) {
    event.preventDefault();
    const result = buildRun(readForm());
    if (!result.ok) {
      status.textContent = `Khong the arm: ${result.error}`;
      return;
    }
    result.run.dryRun = document.querySelector('#dry-run').checked;
    const response = await chrome.runtime.sendMessage({ type: 'ARM_RUN', run: result.run });
    status.textContent = response.ok === false ? `Khong the arm: ${response.error}` : 'Da arm. Kiem tra trang CTU truoc gio mo.';
  }

  async function disarmRun() {
    const response = await chrome.runtime.sendMessage({ type: 'DISARM_RUN' });
    status.textContent = response.ok ? 'Da disarm va xoa lich dang ky.' : `Khong the disarm: ${response.error}`;
  }

  function readForm() {
    return {
      openingAt: document.querySelector('#opening-at').value,
      leadMinutes: document.querySelector('#lead-minutes').value,
      courses: [...list.querySelectorAll('.course-row')].map((row) => ({
        code: row.querySelector('.course-code').value,
        primary: row.querySelector('.primary-group').value,
        fallbacks: row.querySelector('.fallback-groups').value,
      })),
    };
  }

  async function saveDraft() {
    await chrome.storage.local.set({ draftRun: readForm(), dryRun: document.querySelector('#dry-run').checked });
  }

  async function restoreDraft() {
    const { draftRun, dryRun } = await chrome.storage.local.get(['draftRun', 'dryRun']);
    if (!draftRun) return;
    document.querySelector('#opening-at').value = draftRun.openingAt ?? '';
    document.querySelector('#lead-minutes').value = draftRun.leadMinutes ?? 3;
    document.querySelector('#dry-run').checked = dryRun === true;
    list.replaceChildren();
    for (const course of draftRun.courses ?? []) addCourse(course);
    if (list.children.length === 0) addCourse();
  }

  function addCourse(values = {}) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.course-code').value = values.code ?? '';
    row.querySelector('.primary-group').value = values.primary ?? '';
    row.querySelector('.fallback-groups').value = values.fallbacks ?? '';
    row.querySelector('.remove-course').addEventListener('click', () => {
      if (list.children.length > 1) row.remove();
    });
    list.append(row);
  }
}
