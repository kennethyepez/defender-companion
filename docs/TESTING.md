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

## Current limits

The public release does not claim a production tenant integration test, multi-user authorization review, penetration test, full WCAG conformance or a guarantee of malware detection. Live-service acceptance requires an eligible tenant and explicit consent; no such credentials belong in this repository.
