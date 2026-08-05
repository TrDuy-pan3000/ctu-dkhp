const adapter = globalThis.CtuRegistrationAdapter;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !['PREPARE', 'SCAN_COURSES', 'SUBMIT'].includes(message.type)) {
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
  if (message.type === 'SCAN_COURSES') {
    return scanCourses();
  }

  return submitPrepared(message.courses, message.dryRun === true);
}

async function scanCourses() {
  const page = adapter.inspectPage(document);
  if (!page.ok) return page;

  const courses = [];
  for (const [code, entry] of page.rows) {
    entry.selector.click();
    await nextPaint();
    const groups = adapter.extractGroupOptions(document);
    entry.combobox.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    entry.combobox.blur();
    await nextPaint();
    if (groups.length === 0) {
      return { ok: false, error: 'GROUP_CATALOG_EMPTY', courseCode: code };
    }
    courses.push({ code, name: entry.name, groups });
  }
  return { ok: true, courses };
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

async function submitPrepared(courses, dryRun) {
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
  const outcome = await waitForOutcome();
  if (outcome === 'full' && courses.length === 1) {
    return { ok: true, category: outcome, courseCode: courses[0].code };
  }
  return { ok: true, category: outcome };
}

function hasSelectedGroup(selector, group) {
  return [...selector.querySelectorAll('.ant-select-selection-item, .ant-select-selection-overflow-item')]
    .some((element) => adapter.normalize(element.textContent) === group);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function waitForOutcome(timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const existing = adapter.classifyOutcome(document);
    if (existing !== 'ambiguous') {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const outcome = adapter.classifyOutcome(document);
      if (outcome !== 'ambiguous') {
        observer.disconnect();
        resolve(outcome);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(() => {
      observer.disconnect();
      resolve('ambiguous');
    }, timeoutMs);
  });
}
