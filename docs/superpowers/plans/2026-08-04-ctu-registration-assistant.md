# CTU Registration Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Manifest V3 Chrome/Edge extension that prepares configured CTU course groups before a manually entered opening time, submits once on a network-synchronized clock, and follows an ordered fallback only after a confirmed full-capacity outcome.

**Architecture:** A popup stores and arms a registration run; a service worker owns timing, clock estimation, and the finite state machine; a CTU-only content script owns DOM observations and commands. The worker never permits a submit unless a same-run content-script preflight reported exact prepared selections on the registration page.

**Tech Stack:** Manifest V3, browser-native ES modules, plain HTML/CSS, `chrome.storage`/`chrome.alarms`/`chrome.notifications`, Node built-in test runner, JSDOM as a development-only test dependency.

## Global Constraints

- Runtime has no backend, no stored credentials, no UI framework, and no production npm dependency.
- Support Chrome and Edge on Windows with the student already authenticated on `https://dkmhfe.ctu.edu.vn/dangkyhocphan/sinhvien/dangkyhocphan`.
- Use `Asia/Ho_Chi_Minh` display semantics and HTTPS server-time samples; never silently fall back to device time when clock quorum fails.
- Use row/course-code DOM matching; never bind logic to generated Ant Design IDs such as `rc_select_3`.
- Submit only from a user-armed run in `prepared` state; no blind retries, no parallel submissions, and no fallback for ambiguous errors.
- Keep all user-facing Vietnamese copy ASCII where feasible and do not transmit logs or configuration off-device.

---

## File Structure

- `manifest.json`: extension permissions, entry points, and CTU match patterns.
- `src/shared/model.js`: immutable defaults, validation, states, messages, and pure mapping helpers.
- `src/shared/clock.js`: server-time parsing, midpoint offset estimates, and median/outlier selection.
- `src/shared/state-machine.js`: legal state transitions and attempt/fallback decisions.
- `src/background/service-worker.js`: storage, alarms, clock sampling, tab messaging, and notifications.
- `src/content/registration-page.js`: DOM contract validation, group preparation, one-shot click, and outcome observation.
- `src/popup/popup.html`, `popup.css`, `popup.js`: configuration editor, arm/disarm controls, and status/log display.
- `tests/*.test.mjs`: unit, fixture, and orchestration tests.
- `tests/fixtures/registration-page.html`: stable CTU-shaped DOM fixture.
- `package.json`: development scripts and the JSDOM development dependency only.
- `README.md`: installation, configuration, dry-run, and safety limitations.

### Task 1: Extension Skeleton And Development Tests

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `src/shared/model.js`
- Create: `tests/model.test.mjs`

**Interfaces:**
- Produces `RUN_STATES`, `DEFAULT_RUN`, and `validateRun(run)` for all later tasks.

- [ ] **Step 1: Write the failing configuration-validation test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun } from '../src/shared/model.js';

test('rejects duplicated primary and fallback groups', () => {
  const result = validateRun({ openingAt: '2026-08-10T09:00:00+07:00', courses: [{ code: 'CT112', primary: '01', fallbacks: ['01'] }] });
  assert.deepEqual(result, { ok: false, error: 'FALLBACK_DUPLICATES_PRIMARY' });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --test-name-pattern="duplicated primary"`

Expected: failure because `src/shared/model.js` does not exist.

- [ ] **Step 3: Add the manifest, scripts, and minimal model implementation**

```json
// manifest.json
{
  "manifest_version": 3,
  "name": "CTU Registration Assistant",
  "version": "0.1.0",
  "permissions": ["storage", "alarms", "notifications", "tabs"],
  "host_permissions": ["https://dkmhfe.ctu.edu.vn/*", "https://worldtimeapi.org/*", "https://timeapi.io/*"],
  "background": { "service_worker": "src/background/service-worker.js", "type": "module" },
  "action": { "default_popup": "src/popup/popup.html" },
  "content_scripts": [{ "matches": ["https://dkmhfe.ctu.edu.vn/dangkyhocphan/sinhvien/dangkyhocphan*"], "js": ["src/content/registration-page.js"], "run_at": "document_idle" }]
}
```

```js
// src/shared/model.js
export const RUN_STATES = Object.freeze({ DRAFT: 'draft', ARMED: 'armed', PREFLIGHT: 'preflight', PREPARED: 'prepared', SUBMITTING_PRIMARY: 'submitting-primary', PRIMARY_REJECTED: 'primary-rejected', FALLBACK_PREPARING: 'fallback-preparing', FALLBACK_SUBMITTING: 'fallback-submitting', VERIFIED_SUCCESS: 'verified-success', PREFLIGHT_FAILED: 'preflight-failed', MANUAL_ATTENTION: 'manual-attention' });
export const DEFAULT_RUN = Object.freeze({ openingAt: '', leadMinutes: 3, courses: [], armed: false });
const GROUP = /^\d{2}$/;
export function validateRun(run) {
  if (!run.openingAt || !Array.isArray(run.courses) || run.courses.length === 0) return { ok: false, error: 'RUN_INCOMPLETE' };
  const codes = new Set();
  for (const course of run.courses) {
    if (!/^[A-Z]{2,}\d+$/.test(course.code) || codes.has(course.code) || !GROUP.test(course.primary)) return { ok: false, error: 'COURSE_INVALID' };
    codes.add(course.code);
    if ((course.fallbacks ?? []).includes(course.primary)) return { ok: false, error: 'FALLBACK_DUPLICATES_PRIMARY' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Verify the test passes**

Run: `npm install && npm test -- --test-name-pattern="duplicated primary"`

Expected: `pass 1`.

- [ ] **Step 5: Commit**

```bash
git add manifest.json package.json package-lock.json src/shared/model.js tests/model.test.mjs
git commit -m "feat: scaffold extension and run validation"
```

### Task 2: Network Clock Estimation

**Files:**
- Create: `src/shared/clock.js`
- Create: `tests/clock.test.mjs`

**Interfaces:**
- Produces `estimateOffset(samples)` returning `{ok: true, offsetMs}` or `{ok: false, error: 'CLOCK_QUORUM_FAILED'}`.

- [ ] **Step 1: Write failing clock tests**

```js
test('uses median offset after excluding a high-latency sample', () => {
  const result = estimateOffset([{ offsetMs: 11, rttMs: 30 }, { offsetMs: 13, rttMs: 40 }, { offsetMs: 500, rttMs: 900 }]);
  assert.deepEqual(result, { ok: true, offsetMs: 12 });
});
```

- [ ] **Step 2: Run `npm test -- --test-name-pattern="median offset"` and verify failure.**

- [ ] **Step 3: Implement `estimateOffset` with a 250 ms RTT ceiling and at least two samples**

```js
export function estimateOffset(samples) {
  const usable = samples.filter((sample) => Number.isFinite(sample.offsetMs) && sample.rttMs <= 250).sort((a, b) => a.offsetMs - b.offsetMs);
  if (usable.length < 2) return { ok: false, error: 'CLOCK_QUORUM_FAILED' };
  const middle = usable.length / 2;
  return { ok: true, offsetMs: Math.round((usable[Math.floor(middle - 0.5)].offsetMs + usable[Math.ceil(middle - 0.5)].offsetMs) / 2) };
}
```

- [ ] **Step 4: Run `npm test` and expect all clock tests to pass.**
- [ ] **Step 5: Commit with `git commit -am "feat: add network clock estimator"`.**

### Task 3: Registration State Machine

**Files:**
- Create: `src/shared/state-machine.js`
- Create: `tests/state-machine.test.mjs`

**Interfaces:**
- Consumes `RUN_STATES` and a run with `courses`.
- Produces `transition(session, event)` returning session or a terminal `MANUAL_ATTENTION` reason.

- [ ] **Step 1: Write failing transition tests for primary success, capacity fallback, and ambiguous rejection.**

```js
assert.equal(transition({ state: 'submitting-primary' }, { type: 'OUTCOME', category: 'ambiguous' }).state, 'manual-attention');
```

- [ ] **Step 2: Run `npm test -- --test-name-pattern="ambiguous rejection"` and verify failure.**
- [ ] **Step 3: Implement a transition table that permits `OUTCOME: full` only from submit states and increments one fallback index.**
- [ ] **Step 4: Run `npm test` and expect state-machine tests to pass.**
- [ ] **Step 5: Commit with `git add src/shared/state-machine.js tests/state-machine.test.mjs && git commit -m "feat: add guarded registration state machine"`.**

### Task 4: CTU DOM Adapter With Fixtures

**Files:**
- Create: `src/content/registration-page.js`
- Create: `tests/fixtures/registration-page.html`
- Create: `tests/registration-page.test.mjs`

**Interfaces:**
- Produces `inspectPage(document)`, `prepareGroups(document, courses)`, `submitPrepared(document)`, and `classifyOutcome(document)`.
- `inspectPage` returns `ok: false` when course rows, comboboxes, or one unique submit button do not match the contract.

- [ ] **Step 1: Add a fixture containing course-code cells, Ant Select wrappers, and exactly one `button[type="submit"]` labeled `Dang ky`; write a failing test that maps CT112 to its enclosing selector without using its generated ID.**
- [ ] **Step 2: Run `npm test -- --test-name-pattern="maps CT112"` and verify failure.**
- [ ] **Step 3: Implement DOM traversal through the course-code cell's nearest table row; dispatch the same pointer/keyboard events used by the visible Ant Select; require an observed selected label before proceeding.**
- [ ] **Step 4: Add cases for missing group, duplicate code, success row, full-capacity message, and unknown message. Run `npm test`.**
- [ ] **Step 5: Commit with `git add src/content tests && git commit -m "feat: add CTU registration page adapter"`.**

### Task 5: Service Worker Scheduling And Messaging

**Files:**
- Create: `src/background/service-worker.js`
- Create: `tests/service-worker.test.mjs`

**Interfaces:**
- Consumes messages `PREPARE_RESULT`, `SUBMIT_RESULT`, and `OUTCOME` only from the CTU registration URL.
- Produces commands `PREFLIGHT`, `PREPARE`, `SUBMIT`, and `PREPARE_FALLBACK` with `{runId, attempt}`.

- [ ] **Step 1: Write mocks for `chrome.storage`, `chrome.alarms`, `chrome.tabs.sendMessage`, and `fetch`; assert arming creates `preflight:<runId>` and `submit:<runId>` alarms.**
- [ ] **Step 2: Run `npm test -- --test-name-pattern="arming creates"` and verify failure.**
- [ ] **Step 3: Implement storage-backed session creation, repeated two-source clock sampling, preflight dispatch, prepared-fingerprint persistence, deadline submit dispatch, and explicit notification failures.**
- [ ] **Step 4: Add tests proving no `SUBMIT` command fires without a matching prepared fingerprint and no fallback follows an unknown error. Run `npm test`.**
- [ ] **Step 5: Commit with `git add src/background tests/service-worker.test.mjs && git commit -m "feat: schedule guarded registration runs"`.**

### Task 6: Popup Configuration And Status UI

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`
- Create: `tests/popup.test.mjs`

**Interfaces:**
- Saves valid run JSON under `activeRun` and sends `ARM_RUN` / `DISARM_RUN` messages.
- Renders only worker-provided status/log records.

- [ ] **Step 1: Write a DOM test that invalid duplicate fallback data leaves the Arm button disabled.**
- [ ] **Step 2: Run `npm test -- --test-name-pattern="Arm button"` and verify failure.**
- [ ] **Step 3: Build the compact form with date/time, lead time, repeatable course rows, primary/fallback fields, review summary, status, and disarm control. Use semantic labels and no external CSS.**
- [ ] **Step 4: Add tests for valid save, disarm, and received manual-attention status. Run `npm test`.**
- [ ] **Step 5: Commit with `git add src/popup tests/popup.test.mjs && git commit -m "feat: add registration run configuration popup"`.**

### Task 7: Dry Run, Documentation, And Manual Page Contract Check

**Files:**
- Modify: `src/background/service-worker.js`
- Modify: `src/popup/popup.js`
- Modify: `README.md`
- Create: `tests/dry-run.test.mjs`

**Interfaces:**
- Adds `dryRun: boolean`; dry run completes preflight and records readiness but cannot emit `SUBMIT`.

- [ ] **Step 1: Write a failing test asserting a prepared dry run never sends `SUBMIT`.**
- [ ] **Step 2: Run `npm test -- --test-name-pattern="dry run"` and verify failure.**
- [ ] **Step 3: Implement the dry-run branch and visually label it in popup status. Document unpacked installation, CTU login prerequisite, configuration, dry-run proof, live-run risks, and disarm steps in README.**
- [ ] **Step 4: Run `npm test`, then load unpacked extension in Chrome/Edge and run a dry preflight on the current CTU page without clicking registration. Expected: configured groups are prepared, `SUBMIT` is absent from log, and result is `prepared-dry-run`.**
- [ ] **Step 5: Commit with `git add README.md src tests && git commit -m "feat: add dry run and operational guidance"`.**

### Task 8: End-To-End Verification And Release

**Files:**
- Modify: `README.md`
- Create: `docs/manual-test-checklist.md`

- [ ] **Step 1: Write the manual checklist covering session expiry, unavailable primary, network-clock quorum failure, dry run, one-shot success fixture, full-capacity fallback fixture, unknown server error, and disarm.**
- [ ] **Step 2: Run `npm test` and expect every test to pass.**
- [ ] **Step 3: Run `npm run lint` with `node --check` over every JavaScript module and expect zero syntax errors.**
- [ ] **Step 4: Load the unpacked extension, take a dry-run screenshot/status record, and verify no registration button was clicked.**
- [ ] **Step 5: Commit and push**

```bash
git add README.md docs/manual-test-checklist.md
git commit -m "docs: add CTU registration validation checklist"
git push
```

## Plan Review

Coverage: Tasks 1-3 cover validation, time, and state; Task 4 covers the real page contract; Task 5 joins them under alarm-driven orchestration; Task 6 exposes required configuration; Tasks 7-8 establish dry-run and release evidence. The plan intentionally postpones direct internal-API research until after the UI path works.

No placeholder terms are present. All shared names are defined before consuming tasks: `validateRun`, `estimateOffset`, `transition`, page-adapter functions, and worker message types.
