# Security model

Report vulnerabilities privately through GitHub Security, without tenant exports or exploit-bearing evidence in public issues.

The public Pages app contains fictional fixtures only. The optional private server has no Defender mutation route, Microsoft credential, generic proxy or public tunnel. HTTPS production requires a dedicated unprivileged identity, read-only handoff, denied collector access, loopback bind and approved Tailscale Serve identity.

## Authentication

SimpleWebAuthn checks exact origin/RP, one-use two-minute challenges and user verification. Initial enrollment requires a private random setup token. Adding a passkey requires verification with an existing active key; a session cookie alone is insufficient. One-use approvals expire after 60 seconds and bind the session, exact operation and target. Authorization is rechecked after asynchronous signature verification, including counters and active credentials.

Random sessions are stored hashed, with HttpOnly/SameSite Strict cookies and Secure `__Host-` cookies over HTTPS. Idle expiry is 15 minutes, absolute expiry two hours. Key revocation ends its sessions; the last active key is protected. All-session revocation and recovery-code rotation require fresh verification.

Recovery codes are random 128-bit one-use secrets stored as hashes. A code invalidates sessions, permits only replacement enrollment for ten minutes, then successful replacement rotates codes and preserves existing keys. Passkeys authenticate; they do not encrypt the database at rest.

## Privacy and audit

Only the existing hourly collector holds Microsoft access. Its output hook has no network calls. The backend bounds and validates its fixed canonical input and redacts sensitive evidence again. Missing, failed or stale collection never falls back to fixtures. Freshness degrades locally without extra polling.

Live notes remain in tab memory. Logout/expiry clears private state and late responses cannot restore it. Explicit private exports contain only counts and times. Legacy notes from older releases are preserved until deliberate cleanup through Local data.

SQLite retains at most 30 days/10,000 audit events, with HMAC-pseudonymized actors/sources and no tokens, codes, commands, paths or raw IPs. Protect the database and backups. Rate/body limits, exact Origin checks, CSP, no CORS and no-store API responses add browser defenses.

## Residual risks

A stolen session can read the reduced snapshot until expiry/revocation. A recovery code is a bearer secret. A local administrator can defeat host controls; localhost processes can spoof Serve headers, but still need passkey access. No malware-free guarantee, multi-user roles or penetration-test certification is claimed.

Production fails closed until service identity and file isolation are proven. Owner physical enrollment and real ACL/tailnet acceptance are separate from automated protocol tests. Public delivery does not prove a deployed private service. See [deployment](docs/PRIVATE-DEPLOYMENT.md) and [verification](docs/TESTING.md).
