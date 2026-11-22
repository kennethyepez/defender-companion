# Verification guide

## Reproduce the automated checks

```sh
npm ci
npm run format:check
npm run check
npm audit
```

The UI suite uses JSDOM and tests user-visible semantics. JSDOM does not establish visual quality or exercise a physical authenticator. The Node test workers disable Node's experimental native Web Storage so the tests use JSDOM's browser storage rather than a process-global substitute.

The HTTP tests exercise a real Fastify application with an in-memory SQLite store. Boundary tests inject test sessions through the store; the production server has no session-creation bypass. The WebAuthn protocol suite separately registers a generated EC credential and verifies real ECDSA assertions through the production HTTP routes. It rejects wrong origins, wrong RP IDs, missing user verification, tampered signatures and replayed requests, then tests recovery and replacement without losing the original credential. Upstream adapter tests use controlled HTTP responses and assert the requests, pagination limits, streaming response-size bounds, error propagation and host/path restrictions. They do not prove licensing or consent against a real Microsoft tenant.

## Browser acceptance

Use a normal browser against the local app or public static deployment. Check desktop, intermediate and narrow mobile viewports, and verify the actual interface in addition to the build:

1. Open the overview. The fictional-data status and next investigation step must remain clear.
2. Follow the priority alert to evidence and process details. Evidence is text and has no execution control.
3. Search for a nonexistent alert, clear filters, then combine severity and source status.
4. Save a local review with reasoning. Reopen the alert: its source status must stay unchanged.
5. Acknowledge a reminder: the source alert must remain open.
6. Change a local notification preference and reload. No external notification is sent.
7. Search devices and open a specific device; verify the correct device on its antivirus view.
8. Open the screen catalog and visit each of the 46 routes. Empty, permission and connection states must provide a way forward.
9. Check keyboard focus, native dialog containment/closure, visible focus outlines, readable contrast and reduced motion.
10. Export the loaded sample snapshot and verify that only fictional records/local notes are included.

## Private authentication acceptance

Use a disposable local test database and a test-only bootstrap token. A virtual authenticator can test the WebAuthn protocol without enrolling a human credential. Do not use it to log into a real account or replace an owner's physical enrollment.

Verify initial registration with user verification, a subsequent signed login, invalid/replayed requests, logout revocation, a single-use recovery code, and a replacement passkey registered in the limited recovery session. Verify tenant reads remain denied during recovery, and existing credentials/data survive replacement. The HTTP suite covers the negative/session boundaries; browser protocol acceptance is a separate check.

The owner must register and use their own authenticator before a private production deployment is accepted. Physical PIN, biometric verification and credential custody are not part of the public demo.

## Android 1.0.1 interface review

An independent UI/UX reviewer inspected all 46 rendered screens before and after the changes. Findings led to a priority-first overview, object-specific headings, earlier evidence access, readable device risk, neutral descriptions of unavailable controls, and notification preferences that do not imply connected delivery.

All 46 routes were rendered at 393 px and checked for overflow at 360 px. Browser checks exercised the five mobile destinations, alert-to-evidence navigation, selected-device scan history and catalog search/Escape behavior. Desktop layout was inspected separately.

The signed APK was installed and opened in an Android 16/API 36 emulator. Actual screenshots covered native onboarding, gesture and three-button navigation, 130% system text, device rows and manual entry with the keyboard open. Scrolling revealed the complete connection button while retaining the keyboard. The reviewer inspected those renders and confirmed no remaining blocking visual finding in that scope. These checks do not claim acceptance on a physical Samsung or a connected private workspace.

The release retains its update signing identity. Release assembly, release lint and Android parser tests passed. The web/server suite passed 128 tests, with one Windows-only symlink skip. An initial highly parallel run hit worker startup timeouts on the shared Windows host; the full single-worker run passed without relaxing production controls or security assertions.

## Appearance and refresh acceptance, 1.0.2

The web/server suite passed 133 tests with one Windows-only symlink skip. New interaction tests cover pull thresholds, cancellation, horizontal gestures, editing and scrolled content, request deduplication, disabled dialogs, retry, theme persistence and system-theme changes. Production web typechecking/build and Android release assembly/lint passed.

All 46 routes were rendered in Dark at 393 px and checked for horizontal overflow in both themes at 360 px. Nine critical Light routes and both desktop themes were inspected separately. The browser verified saved theme selection, System responding to light/dark media changes, an actual 180 ms route animation and its absence under reduced motion.

The signed release APK was exercised in an Android 16/API 36 emulator. Actual touch gestures showed Pull to refresh and Release to refresh, followed by the demo refresh status; a short gesture did not refresh. Native screenshots covered purple bars, Dark persistence back to onboarding, the QR screen, gesture/three-button navigation and the footer with 130% text. With the keyboard open, scrolling exposed the address, connection action and privacy footer. Android may retain its own contrast scrim behind three-button system navigation; the app menu remains violet. These results do not assert physical Samsung or private-tenant acceptance.

## Current limits

Hardening regressions cover stolen-session enrollment, real signed step-up, action/target/session binding, replay, parallel bootstrap, key/session revocation, recovery and last-key protection. Store tests check expiry, counters and audit pseudonyms. Handoff/boundary tests cover redaction, clock/failure/age/size bounds, private hosts and approved identities. Client tests reject late responses after logout and verify local-only freshness/expiry. Python standard-library tests validate the output whitelist and atomic failure preservation; they make no network requests.

Windows service installation, actual service-token ACL checks, tailnet denial checks and the owner's physical authenticator remain deployment acceptance. Generated test keys do not substitute for these steps.

The public release does not claim a production tenant integration test, multi-user authorization review, penetration test, full WCAG conformance or a guarantee of malware detection. Live-service acceptance requires an eligible tenant and explicit consent; no such credentials belong in this repository.
