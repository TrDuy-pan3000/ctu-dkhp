# High-Resolution CTU Click Design

## Goal

Reduce the final registration click latency and scheduler jitter as far as a browser extension can, while preserving a dry-run mode and explicit failure reporting. This design does not claim a hard sub-10ms or server-arrival guarantee because Chrome, the operating system, and CTU network latency remain outside extension control.

## Architecture

`chrome.alarms` remains a coarse wake-up mechanism only. The preflight alarm fires well before opening, rechecks the network clock, and sends a command to the CTU content script. The content script owns the final deadline and uses `performance.now()` with a short coarse wait followed by a bounded busy-spin to invoke the button click directly in the page.

The background keeps the network offset and the content script receives an absolute local deadline. The content script records scheduled and actual monotonic timestamps in its response. Dry run resolves the button and records timing without invoking `click()`.

## Data Flow

1. Popup arms a click-only run.
2. Background samples independent HTTP `Date` sources and schedules a coarse preflight alarm.
3. Preflight resamples the clock and sends `ARM_PRECISION_CLICK` with `deadlineMs`, `runId`, and `dryRun`.
4. Content script validates the exact CTU button and schedules the local high-resolution click.
5. On click, content script waits for CTU's explicit outcome and returns timing metadata.
6. Background stores verified success, dry-run completion, or manual attention with timing/error details.

## Safety and Failure Handling

- The user still selects groups manually; the extension never changes group controls.
- Missing or ambiguous buttons stop before a live click.
- Dry run never calls `button.click()`.
- A full-capacity or ambiguous CTU response stops without retries or fallback selection.
- If the preflight message arrives too close to the deadline, the content script reports `PRECISION_ARM_TOO_LATE` instead of pretending to meet the target.
- Timing metadata is diagnostic only; it is not evidence that CTU accepted the request before another student.

## Verification

- Unit-test target-time calculations and the late-arm guard with fake monotonic clocks.
- Unit-test the coordinator transition from preflight to precision arm and ensure no submit alarm remains for click-only runs.
- Test the content-script dry-run path with a DOM fixture and assert that the button click spy is not called.
- Run the existing full suite and lint.
- Manual test only with Dry run first; live registration remains an explicit user action.
