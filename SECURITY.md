# Security model

This release is a public portfolio demo with an optional single-administrator private server. It has not undergone an independent penetration test or certification. Please do not include live credentials, tenant records, personal data or exploit payloads in a public issue. Report a reproducible, sanitized defect through the repository's private vulnerability reporting channel if enabled; otherwise ask for a private reporting channel before disclosing sensitive details.

## Controls

| Threat                               | Control                                                                                                  | Residual limit                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Tenant credential exposure           | Server-only environment values; no `VITE_` secrets; fixture-only static deployment                       | Operator must protect environment, process and backups      |
| Unauthenticated security-data access | Passkey session gate before private data routes                                                          | Single administrator, not multi-tenant authorization        |
| Login replay                         | Expiring, one-use challenges; origin/RP checks; user verification; credential counters                   | Requires a trustworthy browser and operating system         |
| Session theft                        | Opaque hashed sessions, HttpOnly/SameSite cookies, Secure cookies on HTTPS, expiry and logout revocation | Local malware can compromise an authenticated endpoint      |
| Cross-origin auth requests           | Exact Origin check for non-GET API requests; no permissive CORS                                          | Same-origin XSS remains a serious risk                      |
| SSRF and token exfiltration          | Fixed upstream resources, fixed cloud hosts, same-path pagination, no redirects                          | Upstream responses remain untrusted                         |
| Unbounded provider reads             | Timeouts, page/record bounds, response-size checks, short-lived cache                                    | A full tenant export is intentionally unsupported           |
| Command/evidence injection           | React text rendering; no HTML injection or execution helpers                                             | Operators must not paste untrusted commands into a terminal |
| Accidental remediation               | No upstream security writes, mutation routes or automatic closure                                        | Source portal actions are outside this app                  |
| Brute-force auth                     | Per-route rate limits; random setup/recovery/session secrets                                             | Distributed attacks need infrastructure-level controls      |

## Private operation

Use a stable HTTPS origin outside localhost, preserve user verification, and run behind a properly configured TLS terminator. The server binds to loopback by default and does not trust forwarded headers. Restrict OS access to the database, its WAL files, `.env` and backups. Database files are not application-encrypted. Passkeys protect sign-in; they do not encrypt the database or JSON exports.

Do not expose this server to untrusted users without adding appropriate authorization, operational monitoring, backup/restore testing and a security review. Do not grant Microsoft write permissions, turn off certificate checks, disable endpoint protection, or relax network isolation to make the app work. The application never requires those changes.

Recovery codes can add a replacement passkey. Store them separately from the device and protect them like credentials. Existing passkeys are intentionally retained; compromised credentials require an operator-led revocation procedure and are not automatically removed by recovery.

## Local records and exports

Review notes and preferences live in browser storage, which is accessible to scripts on the same origin. Avoid sensitive notes on shared devices. A live JSON export may contain security evidence; store and transmit it under your organization's policy. Clearing app-local browser data does not delete source alerts or revoke private server sessions; sign out separately.

## Dependency maintenance

Dependencies are locked; CI runs the test/build checks and an advisory audit. Dependabot proposes updates. A clean advisory report is a dated database result, not a guarantee that the application is free of vulnerabilities. Review dependency changes and rerun the tests before release.
