# ctu-dkhp

Lightweight Chrome/Edge Manifest V3 extension for a network-time-synchronized CTU registration click.

## Safety Model

- The extension never stores passwords and has no backend.
- The user must already be signed in to the CTU registration page.
- The user selects groups directly on the CTU page; the popup does not scan or manage groups.
- Three independent HTTP clock sources are checked when arming and during preflight.
- The final click is scheduled inside the CTU tab with `performance.now()`; `chrome.alarms` is only a coarse wake-up mechanism.
- Ambiguous or full-capacity responses stop in `manual-attention`; no fallback group is guessed.
- A dry run follows the complete timing and button-resolution path but does not click the registration button.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode.
4. Select **Load unpacked** and choose this repository folder.
5. Keep the signed-in CTU registration tab open, visible, and active during the final scheduling window.

## Configure A Run

1. On the CTU page, select the desired group for every course.
2. Open the extension popup and enter the opening time in Vietnam time plus a preparation lead time (1-30 minutes).
3. Use **Dry run** first. It resolves the `Đăng ký` button at the scheduled time without clicking it and reports measured click lateness.
4. Clear Dry run only for an authorized live registration, then select **Arm dang ky**.

The popup saves the time draft locally. **Disarm** removes the active alarms and cancels a pending in-tab scheduler; it does not alter anything already registered by CTU.

## Accuracy Boundary

The scheduler reduces extension-side timer jitter but cannot guarantee a hard sub-10ms or server-arrival deadline. Chrome, the operating system, page JavaScript, network latency, and CTU server scheduling remain outside the extension's control. Treat measured `latenessMs` as diagnostics, not a guarantee of seat allocation.

## Verification

```powershell
npm install
npm test
npm run lint
```

Use [manual-test-checklist.md](docs/manual-test-checklist.md) before a live run.
