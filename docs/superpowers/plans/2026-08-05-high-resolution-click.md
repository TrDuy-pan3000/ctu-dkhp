# High-Resolution CTU Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the final click from a service-worker alarm to a high-resolution scheduler running directly in the CTU tab.

**Architecture:** The background alarm wakes the extension during preflight, resynchronizes the network offset, and sends `ARM_PRECISION_CLICK`. The content script schedules the exact local deadline with `performance.now()`, a coarse timeout, and a bounded final spin. The existing coordinator records timing and outcome state.

**Tech Stack:** Manifest V3, Chrome alarms/runtime messaging, browser `performance.now()`, Node built-in test runner, jsdom fixtures.

## Global Constraints

- Keep the extension lightweight; do not add a backend or credentials.
- Preserve manual group selection and dry-run safety.
- Never claim a hard server-arrival or sub-10ms guarantee.
- Stop on missing, full-capacity, or ambiguous outcomes without automatic fallback.

---

### Task 1: Add deterministic precision scheduling helpers

**Files:**
- Create: `src/shared/precision-scheduler.js`
- Test: `tests/precision-scheduler.test.mjs`

**Interfaces:**
- `scheduleTarget({ targetMs, nowMs, setTimeoutFn, spinWindowMs, onFire })` returns `{ cancel, armedMs }`.
- `computeRemainingMs(targetMs, nowMs)` returns a finite signed number.

- [ ] **Step 1: Write failing tests** for remaining-time calculation, late-arm rejection, and a fake-timer target callback.
- [ ] **Step 2: Run `node --test tests/precision-scheduler.test.mjs` and verify failure.**
- [ ] **Step 3: Implement the helper with coarse timeout plus a bounded `performance.now()` spin and a `cancel` closure.
- [ ] **Step 4: Run the focused test and then `npm test`.**
- [ ] **Step 5: Commit `test: define high-resolution click scheduling behavior`.**

### Task 2: Route click-only preflight into the content script scheduler

**Files:**
- Modify: `src/background/coordinator.js`
- Modify: `src/background/service-worker.js`
- Modify: `src/content/registration-page.js`
- Test: `tests/coordinator.test.mjs`

**Interfaces:**
- Background sends `{ type: 'ARM_PRECISION_CLICK', runId, deadlineMs, dryRun }`.
- Content returns `{ ok, status|category, scheduledAtMs, firedAtMs, latenessMs }`.

- [ ] **Step 1: Add failing coordinator tests** proving click-only preflight sends `ARM_PRECISION_CLICK` and does not create/use a final submit alarm.
- [ ] **Step 2: Run the focused coordinator tests and verify failure.**
- [ ] **Step 3: Change click-only `arm` to create only the preflight alarm; do not create a final submit alarm.**
- [ ] **Step 4: Change click-only `handleAlarm('preflight')` to resync, persist `precision-armed`, and send the precision command with the corrected deadline.**
- [ ] **Step 5: Add content handling for `ARM_PRECISION_CLICK`; resolve the button before arming, return `PRECISION_ARM_TOO_LATE` if less than `spinWindowMs`, and invoke the scheduler. Keep dry run click-free.**
- [ ] **Step 6: Pass timing metadata through `sendToRegistrationTab` into coordinator persistence.**
- [ ] **Step 7: Run `npm test` and `npm run lint`.**
- [ ] **Step 8: Commit `feat: schedule final registration click in page`.**

### Task 3: Update status and manual verification guidance

**Files:**
- Modify: `src/popup/popup.js`
- Modify: `README.md`
- Modify: `docs/manual-test-checklist.md`

**Interfaces:** Display `precision-armed`, `dry-run-no-click`, timing metadata, and manual-attention errors without promising an absolute deadline.

- [ ] **Step 1: Add status copy for precision scheduling and recorded lateness.**
- [ ] **Step 2: Document that the CTU tab must remain open, visible, and idle during the final window.**
- [ ] **Step 3: Run `npm test`, `npm run lint`, and `git diff --check`.**
- [ ] **Step 4: Commit `docs: explain high-resolution click limits`.**

### Task 4: Final verification

**Files:**
- Test: `tests/*.mjs`

- [ ] **Step 1: Run `npm test` and verify all tests pass.**
- [ ] **Step 2: Run `npm run lint` and `git diff --check`.**
- [ ] **Step 3: Confirm `git status --short` is clean and push the commits.**
- [ ] **Step 4: Manual dry-run with the CTU tab; do not run a live click during development.**
