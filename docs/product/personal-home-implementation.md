# Personal Home implementation candidate

## Implemented

- Home at `/`: dark primary environment, depth-projected neural field, compact
  top navigation and conversation growing in place. No marketing landing page.
- Existing foundation service screen moved intact to `/dashboard`; its four
  health assertions and mobile test now navigate to that route.
- Shared conversation transport used by Home and the preserved diagnostic console.
  Existing server challenge, device signature, HttpOnly session and BFF are reused.
- Multiple exchanges retained in page memory, response provenance and privacy,
  explicit synthetic-provider disclosure, returned activity details, account links,
  command menu, reduced motion and confirmation before clearing the page transcript.
- Abortable requests, no duplicate send while pending, stale-result suppression,
  clean reset after failed authentication and clearing. No automatic retries of
  potentially executed turns. UI says “Stop waiting” rather than claiming rollback.
- Desktop state presentation covers the extended approved semantic vocabulary,
  with accessible names, restrained state colors and unchanged event validation.

## Deliberate boundaries

Home has no token, owner or authorization override. It does not store messages in
browser persistence, autoplay audio, request microphone permission or create memory.
Current HTTP conversation returns its execution record after completion; the UI
labels it as historical, not live streaming. Neural motion during the request means
waiting, not a fabricated model reasoning trace. A synthetic answer is marked.

The full PRD is not complete. Cross-reload conversation persistence is not wired;
the page explicitly identifies session-only history. Memory/Knowledge product UIs,
file ingestion, global search over private data, approved action execution, voice,
desktop authentication/runtime transport, mobile installations, real connectors,
agents and production qualification remain unfinished. No fake records, charts or
connection status were added to stand in for those functions.

## Verification contract

Five HomeSession tests cover duplicate submission, cancellation and late results,
clear during execution, late rejection and fresh session binding on retry. Browser
qualification uses explicitly synthetic intercepted conversation responses to test
UI rendering, signature generation, provenance, activity, clear confirmation,
authentication error feedback and responsive desktop/mobile layout. This is UI
contract verification, not a successful owner-enrolled/live-model demonstration.
Existing authenticated HTTP/security tests remain required independently.

The Windows verifier renders every supported state with explicit fixture events;
it retains real sandbox/topmost/alpha/control/restore and consent-race checks.
Target-laptop compositor, actual microphone, battery and hardware tests remain open.

## Local read-aloud continuation

Returned answers now have explicit Read aloud / Stop reading controls. Voice
selection only lists browser-declared localService voices; locality is rechecked
immediately before synthesis and there is no default/remote fallback. No content
is spoken automatically. Actual synthesis start/end callbacks drive the speaking
indicator and Home Core response motion. Stop, replacement, navigation, page hide,
page exit, clear and a new text request cancel playback. Stale callbacks cannot
restore old playback state. Device voice selection appears in Settings.

This is response playback, not speech recognition or the desktop voice runtime.
The browser/OS locality declaration is a trusted platform signal, not independently
verified egress containment. Actual installed voice behavior and audio quality
remain target-device acceptance items. Browser tests use labelled speech fixtures
and make no claim that CI produced audible speech.

References inspected:
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel
