const adapter = globalThis.CtuRegistrationAdapter;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !['PREPARE', 'SUBMIT'].includes(message.type)) {
    return undefined;
  }

  handleCommand(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || 'CONTENT_SCRIPT_ERROR' }));
  return true;
});

async function handleCommand(message) {
  if (message.type === 'PREPARE') {
    return prepareGroups(message.courses);
  }

  return submitPrepared(message.courses, message.dryRun === true);
}

async function prepareGroups(courses) {
  const page = adapter.inspectPage(document);
  if (!page.ok) {
    return page;
  }

  for (const course of courses) {
    const entry = page.rows.get(course.code);
    if (!entry) {
      return { ok: false, error: 'COURSE_NOT_FOUND', courseCode: course.code };
    }

    entry.selector.click();
    await nextPaint();
    const option = adapter.findGroupOption(document, course.group);
    if (!option) {
      return { ok: false, error: 'GROUP_UNAVAILABLE', courseCode: course.code, group: course.group };
    }

    option.click();
    await nextPaint();
    if (!hasSelectedGroup(entry.selector, course.group)) {
      return { ok: false, error: 'GROUP_NOT_SELECTED', courseCode: course.code, group: course.group };
    }
  }

  return { ok: true, prepared: courses.map(({ code, group }) => ({ code, group })) };
}

function submitPrepared(courses, dryRun) {
  const page = adapter.inspectPage(document);
  if (!page.ok) {
    return page;
  }

  for (const course of courses) {
    const entry = page.rows.get(course.code);
    if (!entry || !hasSelectedGroup(entry.selector, course.group)) {
      return { ok: false, error: 'PREPARED_FINGERPRINT_MISMATCH', courseCode: course.code };
    }
  }

  if (dryRun) {
    return { ok: true, status: 'prepared-dry-run' };
  }

  page.submitButton.click();
  return { ok: true, status: 'submit-triggered' };
}

function hasSelectedGroup(selector, group) {
  return [...selector.querySelectorAll('.ant-select-selection-item, .ant-select-selection-overflow-item')]
    .some((element) => adapter.normalize(element.textContent) === group);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
