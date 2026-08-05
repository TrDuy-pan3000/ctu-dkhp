export function buildRun(values) {
  const leadMinutes = Number(values.leadMinutes);
  if (!values.openingAt) {
    return { ok: false, error: 'OPENING_TIME_INVALID' };
  }
  if (!Number.isInteger(leadMinutes) || leadMinutes < 1 || leadMinutes > 30) {
    return { ok: false, error: 'LEAD_TIME_INVALID' };
  }

  const openingAt = `${values.openingAt}:00+07:00`;
  if (!Number.isFinite(Date.parse(openingAt))) {
    return { ok: false, error: 'OPENING_TIME_INVALID' };
  }

  return {
    ok: true,
    run: {
      openingAt,
      leadMinutes,
      clickOnly: true,
      dryRun: values.dryRun === true,
    },
  };
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#run-form');
  const status = document.querySelector('#status');

  form.addEventListener('submit', armRun);
  form.addEventListener('input', saveDraft);
  document.querySelector('#disarm').addEventListener('click', disarmRun);
  void restoreDraft();
  void restoreStatus();

  async function armRun(event) {
    event.preventDefault();
    const armButton = document.querySelector('#arm');
    armButton.disabled = true;
    const result = buildRun(readForm());
    if (!result.ok) {
      status.textContent = `Khong the arm: ${result.error}`;
      armButton.disabled = false;
      return;
    }
    try {
      const response = await withTimeout(chrome.runtime.sendMessage({ type: 'ARM_RUN', run: result.run }), 8_000);
      status.textContent = response?.ok === false
        ? `Khong the arm: ${response.error}`
        : 'Da arm. Hay giu trang CTU mo va de san nhom truoc gio.';
    } catch (error) {
      status.textContent = `Khong the arm: ${error.message || 'ARM_TIMEOUT'}`;
    } finally {
      armButton.disabled = false;
    }
  }

  async function disarmRun() {
    const response = await chrome.runtime.sendMessage({ type: 'DISARM_RUN' });
    status.textContent = response.ok ? 'Da disarm va xoa lich dang ky.' : `Khong the disarm: ${response.error}`;
  }

  function readForm() {
    return {
      openingAt: document.querySelector('#opening-at').value,
      leadMinutes: document.querySelector('#lead-minutes').value,
      dryRun: document.querySelector('#dry-run').checked,
    };
  }

  async function saveDraft() {
    await chrome.storage.local.set({
      draftRun: {
        openingAt: document.querySelector('#opening-at').value,
        leadMinutes: document.querySelector('#lead-minutes').value,
      },
      dryRun: document.querySelector('#dry-run').checked,
    });
  }

  async function restoreDraft() {
    const { draftRun, dryRun } = await chrome.storage.local.get(['draftRun', 'dryRun']);
    if (draftRun) {
      document.querySelector('#opening-at').value = draftRun.openingAt ?? '';
      document.querySelector('#lead-minutes').value = draftRun.leadMinutes ?? 3;
    }
    document.querySelector('#dry-run').checked = dryRun === true;
  }

  async function restoreStatus() {
    const { activeSession, lastError } = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (lastError) {
      status.textContent = `Da dung an toan: ${lastError}`;
    } else if (activeSession?.lastResult === 'dry-run-no-click') {
      status.textContent = 'Dry run da kiem tra nut dang ky va khong click.';
    } else if (activeSession?.state === 'verified-success') {
      status.textContent = 'Da xac minh ket qua dang ky.';
    } else if (activeSession?.state) {
      status.textContent = `Trang thai: ${activeSession.state}`;
    }
  }

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('ARM_TIMEOUT')), timeoutMs)),
    ]);
  }
}
