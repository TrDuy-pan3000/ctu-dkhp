# Manual Test Checklist

Run these checks with a CTU tab open and authenticated. Do not use a live registration window for dry-run checks.

- [ ] Load the unpacked extension and confirm the popup opens without an error.
- [ ] Select the desired groups manually on the CTU page, enable Dry run, and arm a time at least three minutes ahead.
- [ ] Confirm preflight completes and the extension resolves CTU's `Đăng ký` button without clicking it.
- [ ] Disarm before the deadline and confirm the active run is removed from extension storage/visible status.
- [ ] Keep the CTU tab open and active through preflight and the deadline. Expected: one click command at the network-adjusted opening time.
- [ ] Close or navigate away from the CTU tab before the deadline. Expected: `CTU_REGISTRATION_TAB_UNAVAILABLE` and no click.
- [ ] Change a selected group after arming. Expected: the extension does not overwrite it; the click uses the current page state.
- [ ] Disable access to one network time source. Expected: arming stops with `CLOCK_QUORUM_FAILED`.
- [ ] In fixture/development testing, send a full-capacity or ambiguous response. Expected: `manual-attention`; no automatic retry or group change.
- [ ] Before a live run, verify the manually selected groups on the CTU page and confirm Dry run is disabled intentionally.
