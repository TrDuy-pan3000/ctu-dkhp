# CTU Registration Assistant - Design Specification

## Goal

Build a lightweight Chrome/Edge Manifest V3 extension for the CTU course-registration page. The student configures course groups and a local registration-open time. Before the opening time, the extension prepares the preferred groups on the already-authenticated page. At the precise network-synchronized time, it submits one registration request, verifies the outcome, and only then follows the student's ordered fallback script for confirmed capacity failures.

## Scope And Non-Goals

In scope:

- Windows Chrome/Edge with the student already signed in at `https://dkmhfe.ctu.edu.vn`.
- Manual configuration of the opening time, preferred group, and ordered fallback groups.
- Preflight preparation, precise one-shot submission, confirmed-result verification, and limited fallback.
- Local-only configuration, diagnostic logs, and notifications.

Out of scope:

- Password storage, automatic sign-in, a cloud/backend service, or operation while the browser is closed.
- Bypassing CAPTCHA, rate limits, access controls, or university rules.
- Blind repeated submissions or guessing undocumented private endpoints.

## User Configuration

Each registration run contains:

- Opening time in Vietnam time, entered by the student.
- A lead time, defaulting to 3 minutes.
- One or more course rules: `course code`, `primary group`, and an ordered list of fallback groups.
- An explicit enabled state. A run must be armed manually after reviewing the summarized configuration.

The popup validates that a course code is unique, group identifiers match the expected `01`-style format, fallback groups do not repeat the primary group, and the opening time is in the future. Configuration is stored only in `chrome.storage.local`.

## Architecture

### Popup

The popup is a small configuration and status surface. It allows creation, editing, import/export as JSON, arming, disarming, and log review. It never asks for or stores credentials.

### Background Service Worker

The service worker owns the state machine, storage, alarms, clock synchronization, notifications, and message validation. It creates an alarm for the preflight lead time and a second alarm for the registration time. The content script reports page state and receives narrowly scoped commands; it cannot initiate registrations on its own.

### Content Script

The content script is constrained to the CTU registration domain. It locates the academic-plan table by course-code cell text, associates each row with its group selector, selects the configured group, observes the page's own pending-registration state, triggers the visible registration button exactly when commanded, and verifies the page's resulting state or explicit error message.

Selectors are derived from row structure and visible course codes, never transient Ant Design `rc_select_*` IDs. Current page observations confirm that each course row has an Ant Design combobox and that the visible `Dang ky` button is a submit control. The implementation must revalidate those contracts before arming a run.

### Network Clock

The worker samples two or more HTTPS time sources permitted by extension host permissions. For each source, it estimates offset as `server timestamp - midpoint(local send, local receive)`, rejects high-latency outliers, and takes the median usable offset. The displayed time and firing deadline use this offset. If no usable quorum is available within the preflight window, the run aborts rather than trusting the device clock.

## State Machine

`draft -> armed -> preflight -> prepared -> submitting-primary -> verified-success`

Failure branches:

- `preflight-failed`: tab missing, wrong URL, expired session, unexpected DOM, missing course, unavailable primary group, or time-source quorum failed.
- `primary-rejected`: a definite page response says full/closed/registration rejected. Only a capacity-full response is eligible for fallback.
- `fallback-preparing -> fallback-submitting -> verified-success` repeats strictly in configured order.
- `manual-attention`: response is ambiguous, page is disconnected, a server error occurs, registration window is closed, or all fallback groups are exhausted.

No state may perform a second submit unless the preceding submit has a verified, eligible capacity failure. A unique run ID and attempt index prevent duplicate commands after service-worker restart.

## Timing And Performance

Preflight runs at `opening time - lead time`. It does the heavier DOM work before the deadline: confirms authentication, matches all courses, sets primary groups, waits for the table to show pending selections, performs a final network-clock sample, and records a readiness timestamp.

At the deadline, the extension performs only: focus existing tab if needed, validate the prepared fingerprint, click the single visible registration button, and start response observation. It has no continuous polling before the lead window. During fallback, it waits only for a concrete completion/error state, uses bounded per-step timeouts, and performs no parallel competing submission.

The extension uses plain TypeScript/JavaScript modules and browser APIs. It avoids UI frameworks and large dependencies.

## Safety And Correctness Rules

- Registration is allowed only while a user-armed run is in `prepared` state and only on the exact CTU registration URL.
- Before primary submission, the content script compares the currently selected course/group pairs against the complete armed configuration.
- It never changes a manually selected group outside an armed run.
- On ambiguity it stops and notifies rather than choosing a group or retrying.
- Success requires the course/group to appear in the site's registered-course state, not merely a clicked button or a toast.
- The log contains timestamp, offset estimate, attempted course/group mapping, page outcome category, and DOM contract version. It excludes tokens and credentials.

## Error Handling

| Condition | Action |
| --- | --- |
| Session expired or redirected | Abort preflight and notify the user to sign in again. |
| Course/group absent | Abort without submitting. |
| DOM contract changed | Abort and report the affected selector contract. |
| Network clock has no quorum | Abort before opening time; no device-clock fallback. |
| Primary succeeds | Verify all configured courses; mark run successful. |
| Primary is definitely full | Attempt the next configured fallback only for that course. |
| Server/network/unknown error | Stop and require manual review. |
| All fallbacks fail | Mark exhausted and show the exact final status. |

## Testing Strategy

- Unit tests for time-offset median/outlier rejection, schedule calculation, configuration validation, transitions, deduplication, and fallback eligibility.
- Fixture-driven content-script tests for the present CTU table layout, missing courses, duplicate course codes, absent group options, success indicators, full-capacity indicators, and ambiguous responses.
- Integration tests with mocked `chrome.alarms`, `chrome.storage`, clock fetches, and content-script messages.
- A manual dry-run mode that performs preflight and records readiness but deliberately never clicks `Dang ky`.
- A real-page preflight test using the existing logged-in tab, with no registration submission, before any live attempt.

## Optional Direction 2 Research

After direction 1 is stable, inspect the page's own request flow in read-only developer tools. Any direct request optimization must use the same authenticated session and CSRF safeguards, have fixture and live dry-run coverage, and remain opt-in. It is not a prerequisite for, nor a replacement for, the UI-driven primary flow.
