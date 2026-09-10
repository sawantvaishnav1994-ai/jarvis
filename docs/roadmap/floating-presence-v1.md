# Floating Presence V1 implementation evidence

Date: 2026-09-09. Status: desktop candidate; V1 acceptance NOT PASSED.
Baseline: `2586049619072da592ed1d4b7eb225fa0a955e69`.

The owner's immediate target is the ten-item desktop proof of concept. Later
memory, knowledge, tools, approval, background and error visual states remain
behind that acceptance gate. No milestone completion status is changed here.

## Technology decision

The existing `apps/desktop/README.md` reserved Tauri or Electron; it had no app.
Electron supports frameless transparent always-on-top windows and isolated preload
IPC directly. Three.js is used for modest real spatial geometry, without adding
React, another web dashboard or a renderer dependency to Core. Electron's memory
cost and platform compositor limits require measurement before final selection.
Versions are pinned in the workspace lockfile. This is a reversible prototype
selection, not a benchmark-backed final platform decision.

References inspected:
- https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/tutorial/security

## Implemented candidate

- Native transparent, frameless always-on-top shell, small normal bounds.
- Real Three.js geometry, alpha background and perspective depth.
- Pointer dragging, persisted position/size and work-area clamping.
- Compact controls, click/double-click, tray, keyboard recovery and click-through.
- Idle, listening, reasoning and responding renderer treatments.
- Actual permission-controlled microphone amplitude preview; raw audio never stored.
- Semantic versioned state controller over inherited private IPC, replay/expiry checks.
- Adaptive rendering, hidden pause and performance instrumentation.
- Reduced motion, high contrast, accessible control names and optional labels.
- Hide/quit separation from independently running core services.

## Local verification

- Presence event/display tests: 3 passed.
- Repository lint, boundary checks and TypeScript checks: passed.
- Existing unit/contract/security suite: 657 tests passed across 70 files.
- Web production build: passed.
- Python syntax/boundary check and 68 regression tests: passed.

These checks do not establish native acceptance. Electron binary installation
succeeded, but this environment runs as root with no desktop display. Native
launch refused root execution with the sandbox enabled; sandbox protection was
not disabled. Transparent compositing, real microphone permission dialogs, actual
frame rate, idle GPU use, memory, startup and battery remain unmeasured here.

## Blocking acceptance gaps

1. Connect authenticated live runtime events through an owner/device-bound desktop
   session. Current J1.13 conversation returns historical events and uses a
   synthetic model; no live ASR/TTS runtime is available to wire honestly.
2. Demonstrate complete speak → understand → authorized action → spoken response
   without Home opening. Current mic control is explicitly a local preview.
3. Benchmark on the target laptop: 60 seconds idle, listening, thinking and speaking;
   record p50/p95 frame interval, process CPU/RSS, GPU utilization, startup latency,
   foreground-app responsiveness and a controlled battery comparison.
4. Verify transparency over another app, empty-area click behavior, drag across
   monitors with different DPI, monitor removal, hide/reopen and service continuity.
5. Package/sign installers, test permissions and OS-specific window behavior.
6. Only after passing baseline, integrate later semantic states and contextual
   approvals with existing authorization controls; no renderer-granted authority.

Mobile work is not implemented in this desktop-first increment. Do not interpret
the reference iPhone overlay as an implemented iOS capability. Platform research
and native implementation remain future work.

## Recovered product candidate

The workspace recovered on the following turn. Source is now carried on
`validation/j1.product-readiness-20260909`, together with the opt-in local model
adapter and corrected V1/V2 requirement register. Default conversation remains
synthetic; local configuration can select the new adapter. This does not provide
a live desktop voice connection or satisfy native acceptance.
