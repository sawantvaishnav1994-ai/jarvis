# JARVIS Floating Presence desktop candidate

Implementation candidate, not an accepted V1 release. Extends the existing desktop
composition boundary at main `2586049619072da592ed1d4b7eb225fa0a955e69`.
Core, authentication, policy, database, providers and web Home are unchanged.

## Run

Use the repository-supported Node/npm versions. Run `npm ci` at repository root,
then `npm start --workspace @jarvis/desktop` on a normal desktop user account.
If install scripts are disabled by local npm configuration, run
`node node_modules/electron/install.js` to install the Electron executable.
Do not disable Chromium's sandbox to run this app as root.

`JARVIS_HOME_URL` optionally selects the existing Home (default
`http://localhost:3000`). Only HTTPS or loopback HTTP is accepted. Home opens in
the system browser, retaining its existing authentication boundary. This app does
not automatically start, stop, enroll or authenticate the core services.

Click opens compact controls; double-click opens Home; drag moves the presence.
Ctrl/Cmd+Shift+J restores the window and mouse interaction. The tray provides
Show, Hide, Open Home and Quit. Escape collapses controls, then hides presence.
Click through disables all window mouse input; restore via shortcut or tray.
Size options are 100, 120 and 140 logical pixels. Window position and size persist.
Hiding stops this surface's microphone capture and rendering; it sends no runtime
shutdown command. No system-wide wake-word listener is installed.

## Voice and runtime limitations

Mic preview requires explicit consent and OS permission. It analyzes live audio
amplitude locally without recording, transmitting or retaining it. It is NOT
speech recognition or a completed voice assistant. Capture stops on hide, Escape,
track loss or window invisibility. Camera and screen permissions are denied.

The default HTTP conversation implementation composes `SyntheticModelAdapter`;
the new opt-in local Ollama configuration is documented in the local-model report.
Its response events are returned after execution; replaying them as live activity
would be misleading. This candidate does not do that. No ASR/TTS bridge exists in
the baseline. Full voice commands therefore remain blocked on an authenticated
voice/runtime integration and its privacy tests.

A trusted parent composition root can send presentation events over inherited
Node IPC to the Electron main process. No network socket is opened. The renderer
has no API to inject runtime states or grant authority. Event shape:

```json
{"version":1,"type":"presence.reasoning","runId":"run-1","sequence":1,"at":0,"amplitude":0}
```

Use actual current epoch milliseconds for `at`, monotonically increasing sequence
numbers across the sender's connection, and heartbeat at least once per five
seconds. Supported baseline states: idle, listening, reasoning, responding.
Amplitude is normalized 0–1 and must come from the corresponding live audio source.
Expired, invalid and replayed events are rejected. Disconnect/expiry shows idle and
runtime disconnected in controls. No completed turn is replayed as live work.
This transport is an integration seam, not a claim of live server integration.

## Rendering and performance

Three.js WebGL renders 720 spatial points and connected strands with true perspective,
transparent alpha, restrained depth motion and state-sensitive deformation. Idle is
capped at 12 fps; active at 30 fps; reduced motion at 4 fps with geometry motion
removed. Rendering pauses when hidden. Submission-time pressure reduces geometry
and active frame rate; it is only a local load proxy, not system-wide GPU telemetry.
DPR is capped at 1.5. WebGL failure retains accessible controls and state labels.

Performance control reports measured frame intervals, render submission time,
particle count, native process CPU/memory, GPU feature status and startup time.
Submission time is NOT GPU execution time. GPU utilization and battery impact need
OS-level measurement. Baseline settings are targets, not achieved measurements.

## Validation

`npm test --workspace @jarvis/desktop` checks event rejection, payload stripping,
expiry and display clamping. `npm run check` and `npm run build:web` preserve the
existing application gates. Native acceptance still requires Windows/macOS/Linux
compositor testing, real microphone permissions and hardware measurement.
See `docs/roadmap/floating-presence-v1.md` for evidence and remaining gates.
