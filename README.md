# ctu-dkhp

Lightweight Chrome/Edge Manifest V3 extension for prepared, network-time-synchronized CTU course registration.

## Safety Model

- The extension never stores passwords and has no backend.
- The user must already be signed in to the CTU registration page.
- It prepares primary groups before the configured opening time and only submits after network-clock quorum passes.
- It stops on an unknown response. A fallback can run only after a definite full-capacity response for one identified course.
- A dry run performs preflight and group preparation but does not click the registration button.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode.
4. Select **Load unpacked** and choose this repository folder.
5. Keep the CTU registration tab signed in and open before arming a run.

## Configure A Run

1. Open the extension popup.
2. Enter the registration opening time in Vietnam time and a preparation lead time (1-30 minutes).
3. Add each course code, its primary group, and comma-separated fallback groups in priority order.
4. First use **Dry run** to confirm that all groups reach the CTU page's pending state.
5. Remove Dry run only after reviewing the configuration, then select **Arm dang ky**.

The popup saves an editable draft locally. **Disarm** removes the active alarms and active run; it does not alter anything already registered by CTU.

## Verification

```powershell
npm install
npm test
npm run lint
```

Use [manual-test-checklist.md](docs/manual-test-checklist.md) before a live run. The extension is an assistant, not a guarantee of seat availability: CTU servers may receive competing requests and may change their UI or response messages.
