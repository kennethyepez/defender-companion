# Connection hardening review

An independent coding agent reviewed the final authentication, session, recovery, privacy, handoff and private-boundary changes. This was an internal code and regression review, not an external penetration test or certification.

The review found a contradictory green “Up to date” badge when an old snapshot contained no open alerts. The private view now uses neutral “No open alerts in snapshot” text, while collection age/failure remains explicit. A regression covers this case. No other blocking code finding was identified within the reviewed scope.

Verification included genuine generated EC WebAuthn registrations/assertions, stolen-session enrollment denial, action-bound step-up and replay checks, revocation/recovery, idle/absolute expiry, minimized export, redacted audit and bounded handoff reads. The reviewer independently checked migration from the earlier SQLite schema: keys, identity and unused recovery codes survive, while legacy unbound sessions expire. Client regressions cover late responses, private-note memory and local freshness without polling. Python tests cover the output hook; its integration preserves the existing collector and event queue.

The backend contains no Microsoft credential and performs no Microsoft calls. A private host's output hook can be verified separately from deployment. The public demo and its CI artifact remain fixture-only.

## Acceptance still required for each private deployment

- Installation under the actual dedicated non-administrator service identity.
- Real read-only handoff and denied collector-file access, private tailnet routing and unapproved-user denials.
- The owner's real passkey registration, sign-in and recovery acceptance.

The hardened entrypoint fails closed when these production prerequisites are absent. Neither passing tests nor the public demonstration establishes that a private service is operational. Endpoint protection, quarantine and network-inspection settings are outside these app changes.
