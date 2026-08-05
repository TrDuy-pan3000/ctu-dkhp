import { validateRun } from '../shared/model.js';

export function buildRun(values) {
  const leadMinutes = Number(values.leadMinutes);
  const run = {
    openingAt: `${values.openingAt}:00+07:00`,
    leadMinutes,
    courses: values.courses.map((course) => ({
      code: course.code.trim().toUpperCase(),
      primary: course.primary.trim(),
      fallbacks: Array.isArray(course.fallbacks)
        ? course.fallbacks
        : course.fallbacks.split(',').map((group) => group.trim()).filter(Boolean),
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
  let catalog = [];

  addCourse();
  document.querySelector('#add-course').addEventListener('click', addCourse);
  form.addEventListener('submit', armRun);
  form.addEventListener('input', saveDraft);
  document.querySelector('#disarm').addEventListener('click', disarmRun);
  void restoreDraft();
  void restoreStatus();
  void loadCatalog();

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
        fallbacks: [...row.querySelector('.fallback-groups').selectedOptions].map((option) => option.value),
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

  async function loadCatalog() {
    const response = await chrome.runtime.sendMessage({ type: 'SCAN_COURSES' });
    if (!response?.ok) {
      status.textContent = `Khong the nap hoc phan: ${response?.error ?? 'SCAN_FAILED'}`;
      return;
    }
    catalog = response.courses;
    for (const row of list.querySelectorAll('.course-row')) populateCourseOptions(row);
  }

  async function restoreStatus() {
    const { activeSession, lastError } = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (lastError) {
      status.textContent = `Da dung an toan: ${lastError}`;
    } else if (activeSession?.lastResult === 'prepared-dry-run') {
      status.textContent = 'Dry run da chuan bi nhom va khong gui dang ky.';
    } else if (activeSession?.state === 'verified-success') {
      status.textContent = 'Da xac minh ket qua dang ky.';
    } else if (activeSession?.state) {
      status.textContent = `Trang thai: ${activeSession.state}`;
    }
  }

  function addCourse(values = {}) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.savedCode = values.code ?? '';
    row.dataset.savedPrimary = values.primary ?? '';
    row.dataset.savedFallbacks = Array.isArray(values.fallbacks) ? values.fallbacks.join(',') : values.fallbacks ?? '';
    row.querySelector('.course-code').addEventListener('change', () => populateGroupOptions(row));
    row.querySelector('.remove-course').addEventListener('click', () => {
      if (list.children.length > 1) row.remove();
    });
    list.append(row);
    if (catalog.length) populateCourseOptions(row);
  }

  function populateCourseOptions(row) {
    const select = row.querySelector('.course-code');
    const saved = row.dataset.savedCode || select.value;
    select.replaceChildren(new Option('Chon hoc phan', ''));
    for (const course of catalog) select.add(new Option(`${course.code} - ${course.name}`, course.code));
    select.value = saved;
    populateGroupOptions(row);
  }

  function populateGroupOptions(row) {
    const course = catalog.find((item) => item.code === row.querySelector('.course-code').value);
    const primary = row.querySelector('.primary-group');
    const fallbacks = row.querySelector('.fallback-groups');
    const savedPrimary = row.dataset.savedPrimary || primary.value;
    const savedFallbacks = (row.dataset.savedFallbacks || [...fallbacks.selectedOptions].map((option) => option.value).join(','))
      .split(',').filter(Boolean);
    primary.replaceChildren(new Option('Chon', ''));
    fallbacks.replaceChildren();
    for (const group of course?.groups ?? []) {
      primary.add(new Option(group, group));
      fallbacks.add(new Option(group, group, false, savedFallbacks.includes(group)));
    }
    primary.value = savedPrimary;
  }
}
