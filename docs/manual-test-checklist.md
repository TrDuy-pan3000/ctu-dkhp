# Manual Test Checklist

Run these checks with a CTU tab open and authenticated. Do not use a live registration window for the dry-run checks.

- [ ] Load the unpacked extension and confirm the popup opens without an error.
- [ ] Enter one real displayed course and group, enable Dry run, arm a time at least three minutes ahead, and confirm the configured group becomes selected before the deadline.
- [ ] Confirm the status is `prepared-dry-run` and CTU's `Dang ky` button was not clicked.
- [ ] Disarm before the deadline and confirm the active run is removed from extension storage/visible status.
- [ ] Test an unavailable group. Expected: preflight stops with `GROUP_UNAVAILABLE`; no submit click.
- [ ] Test a missing course code. Expected: preflight stops with `COURSE_NOT_FOUND`; no submit click.
- [ ] Close or sign out of the CTU tab before preflight. Expected: a safe `CTU_REGISTRATION_TAB_UNAVAILABLE` error.
- [ ] Disable access to one network time source. Expected: arming stops with `CLOCK_QUORUM_FAILED`.
- [ ] In fixture/development testing, send an explicit single-course full-capacity response. Expected: the next configured fallback is prepared exactly once.
- [ ] In fixture/development testing, send an ambiguous error or a multi-course full-capacity response. Expected: `manual-attention`; no fallback selection or second submit.
- [ ] Before a live run, verify every configured course/group pair in the popup matches the desired CTU registration plan.
