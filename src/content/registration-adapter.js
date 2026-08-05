(() => {
  const COURSE_CODE = /^[A-Z]{2,}\d+$/;

  function inspectPage(document) {
    const rows = new Map();

    for (const row of document.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('td')];
      const codeCell = cells.find((cell) => COURSE_CODE.test(normalize(cell.textContent)));
      if (!codeCell) {
        continue;
      }

      const code = normalize(codeCell.textContent);
      if (rows.has(code)) {
        return { ok: false, error: 'DUPLICATE_COURSE_CODE' };
      }

      const combobox = row.querySelector('input[role="combobox"]');
      const selector = combobox?.closest('.ant-select') ?? combobox?.parentElement;
      if (!combobox || !selector) {
        return { ok: false, error: 'GROUP_SELECTOR_MISSING' };
      }

      rows.set(code, { row, selector, combobox });
    }

    if (rows.size === 0) {
      return { ok: false, error: 'COURSE_TABLE_MISSING' };
    }

    const submitButtons = [...document.querySelectorAll('button[type="submit"]')]
      .filter((button) => /^(Dang ky|Đăng ký)$/i.test(normalize(button.textContent)));
    if (submitButtons.length !== 1) {
      return { ok: false, error: 'REGISTER_BUTTON_INVALID' };
    }

    return { ok: true, rows, submitButton: submitButtons[0] };
  }

  function normalize(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function classifyOutcome(document) {
    const outcome = [...document.querySelectorAll('[data-registration-outcome], [role="alert"], .ant-message-notice-content, .ant-modal-body')]
      .map((element) => normalize(element.textContent))
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('vi');
    if (/\b(lop hoc phan da day|lớp học phần đã đầy|het cho|hết chỗ)\b/.test(outcome)) {
      return 'full';
    }
    if (/\b(dang ky hoc phan thanh cong|đăng ký học phần thành công)\b/.test(outcome)) {
      return 'success';
    }
    return 'ambiguous';
  }

  function findGroupOption(document, group) {
    const matches = [...document.querySelectorAll('.ant-select-item-option, [role="option"]')]
      .filter((option) => normalize(option.textContent) === group);
    return matches.length === 1 ? matches[0] : null;
  }

  globalThis.CtuRegistrationAdapter = Object.freeze({
    classifyOutcome,
    findGroupOption,
    inspectPage,
    normalize,
  });
})();
