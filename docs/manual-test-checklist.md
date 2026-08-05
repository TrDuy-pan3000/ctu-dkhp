# Manual Test Checklist

Run these checks with a CTU tab open and authenticated. Do not use a live registration window for dry-run checks.

- [ ] Load the unpacked extension and confirm the popup opens without an error.
- [ ] Select the desired groups manually on the CTU page, enable Dry run, and arm a time at least three minutes ahead.
- [ ] Keep the CTU tab visible and active during the final minute. Expected: the extension reports `precision-armed` and later `dry-run-no-click`.
- [ ] Confirm the popup reports measured `latenessMs` and CTU's `Đăng ký` button was not clicked.
- [ ] Disarm before the deadline and confirm the active run is removed and the pending in-tab scheduler is canceled.
- [ ] Close or navigate away from the CTU tab before preflight. Expected: `CTU_REGISTRATION_TAB_UNAVAILABLE` and no click.
- [ ] Change a selected group after arming. Expected: the extension does not overwrite it; the click uses the current page state.
- [ ] Disable access to one network time source. Expected: arming still works if two sources agree.
- [ ] Make two clock sources disagree by more than 1.5 seconds in a fixture. Expected: `CLOCK_QUORUM_FAILED`.
- [ ] In fixture/development testing, send a full-capacity or ambiguous response. Expected: `manual-attention`; no automatic retry or group change.
- [ ] Before a live run, verify the manually selected groups, keep the CTU tab foregrounded, and confirm Dry run is disabled intentionally.
