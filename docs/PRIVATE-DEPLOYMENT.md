# Private deployment

## Boundary and flow

Approved human + passkey → tailnet-only Tailscale Serve HTTPS → loopback backend → minimized read-only handoff.

The existing collector keeps its certificate, sole `SecurityAlert.Read.All` grant and hourly schedule. `tools/companion_handoff.py` is an output hook, not a collector: no authentication, network or subprocess calls. Call `export_success(snapshot, actual_read_time, fixed_file)` after a successful existing read and `export_failure(actual_attempt_time, fixed_file)` on failure. Isolate hook failures from the collector status, event queue and notifications. The hook writes atomically. No additional monitor, task, API call or permission is required.

The backend has no Microsoft credential. Only counts, severity/status/category, associated device labels and generic observations cross this boundary. Full evidence remains at the fixed HTTPS Defender source link.

## Development

Use Node.js 24+ and Python 3 for the tests. Run `npm ci`, `npm run check`, copy `.env.example` to a private `.env`, and create a random 32-byte bootstrap token locally. Keep `APP_ORIGIN=http://localhost:4318`, `RP_ID=localhost`, then `npm start`. Open `http://localhost:4318/?mode=live#access`. Never send the token or codes in chat. Without a handoff, access can be tested, but private views report unavailable; no fixtures are substituted. Configuring any real handoff also requires the service isolation checks, even with a localhost origin.

## Production prerequisites

1. Keep one stable HTTPS `.ts.net` origin and identical RP ID. The backend binds only `127.0.0.1`; other binds are rejected.
2. Run under a dedicated non-administrator Windows virtual service account (exact service SID in `SERVICE_ACCOUNT_ID`) or dedicated non-root Linux UID. A compatible service host is an external deployment prerequisite. This repository does not install a service wrapper or second collector. Windows service installation and Serve configuration require an administrative token.
3. Give the service read/execute on an administrator-protected deployed app/runtime, modify only on its private database directory, and read-only on the **handoff subdirectory**. Preserve collector owner/SYSTEM/admin ACLs. Never grant the service the collector directory, certificate or connection file. Keep bootstrap configuration private. Do not serve code from a shared writable checkout.
4. Set fixed canonical `HANDOFF_FILE` and `PROTECTED_COLLECTOR_FILE` paths. The protected file must exist and be readable by the collector, but inaccessible to the backend. Startup checks actual identity, denies administrator membership, requires handoff read but not write, and verifies denial of collector configuration reads. Handoff junction/symlink paths and oversized/invalid content are refused. Run `deploy/check-private-access.ps1` under the intended service identity for a read-only preflight.
5. Configure exact `ALLOWED_TAILNET_LOGINS`. Use Tailscale **Serve**, never Funnel, forwarding the selected HTTPS origin to loopback. Preserve existing Serve routes; do not reset them or create public ingress. Restrict the tailnet grant to intended users/devices. The app additionally checks approved human identity, exact Host and direct loopback peer on every request. Tagged nodes with no identity and unapproved shared users are denied. See [official Serve documentation](https://tailscale.com/docs/features/tailscale-serve).
6. Start only this workspace service. Verify unapproved users and direct network requests are denied. At its private origin, the owner enters the setup token, registers a passkey, saves recovery codes and tests sign-out/sign-in. Test another key with step-up, invalid/replayed verification and recovery without loss of access before relying on it. PIN, biometrics and physical touch belong to the owner.

These steps change no Defender setting, inspection, endpoint isolation, quarantine or Microsoft grant. They do not authorize quarantined devices to contact LAN hosts. There is no public fallback.

## Build a private package

Run `npm run build:private-package -- .local/private-release` after the normal checks. The packager reuses the audited installed production dependencies and excludes frontend-only modules from the backend. It creates no credentials and makes no network requests. Host-specific administrative plans, setup tokens and receipts stay private, outside the published repository.

Use the owner's normal UAC flow for installation; cancellation must stop that attempt. Do not enable SSH or create an administrative backchannel. Verify the real service token, file-access denials, loopback-only listener and preservation of existing Serve routes after installation. Genuine owner passkey enrollment is still required before claiming live acceptance.

Different HTTPS ports on one Serve hostname share cookie scope. The workspace also requires a session-bound proof stored only in tab memory. A cookie received by another port cannot read the workspace or manage access without it. Reloading requires a fresh sign-in; the proof is never returned through a GET or status response.

## Acceptance and rollback

Automated protocol tests and public builds do not prove production deployment. Acceptance also needs actual service-token ACL checks, private tailnet/user denial checks, source freshness and owner passkey use. Until then production remains pending, with the entrypoint failing closed.

Back up SQLite consistently with a SQLite-aware backup or a clean stop of only this service. Preserve the WAL. Migration retains public keys and recovery hashes while expiring legacy unbound sessions. Roll back only this workspace code/config/database and its own Serve route. Preserve collector schedule, queue and endpoint protections.

## Recovery and remaining risk

A one-use recovery code invalidates existing sessions, allows replacement enrollment for ten minutes and cannot read source data. Successful replacement preserves keys and rotates codes. Access revocation and code renewal require action-bound step-up; the last active key cannot be removed.

A compromised local administrator/kernel can tamper with the service, handoff or trusted headers. Passkeys and service separation do not disinfect a compromised host. Full source links and device labels remain sensitive. This is a single-operator workspace, not multi-tenant authorization.
