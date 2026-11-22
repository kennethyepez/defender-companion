# Optional private workspace

## Local setup

```sh
npm ci
npm run build
```

Copy `.env.example` to `.env` and generate a setup token locally:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Place the result in `BOOTSTRAP_TOKEN` in the local `.env`; never commit or send it in a chat. Keep `APP_ORIGIN=http://localhost:4318` and `RP_ID=localhost` for this local setup. Optional Microsoft values belong only in that server file. Use a dedicated application with the documented reading grants. The passkey flow itself can be exercised without Microsoft credentials, but tenant views remain unavailable until those credentials are configured.

```sh
npm start
```

Open `http://localhost:4318/?mode=live#access`, enter the private setup token locally and register your authenticator. Save the one-time recovery codes privately. Sign out and verify sign-in with the same passkey before relying on the deployment. The root URL without `?mode=live` remains the fictional-data demo. For separate frontend/server development, run `npm run dev:server` and `npm run dev`; the Vite proxy serves local requests, but WebAuthn requires the configured frontend origin/RP to match the address actually used.

## Hosting boundaries

The public demo is complete without a Microsoft connection. This guide describes the optional single-administrator server; it does not authorize registering an Entra application or granting tenant access on anyone's behalf.

## Data flow and storage

Your browser signs in to your own server with a passkey. The server reads selected Microsoft security APIs using a dedicated service identity. Tenant ID, client ID and client secret stay in the server environment, never in a frontend build or GitHub Pages. SQLite stores passkey public keys, credential counters and hashed session/recovery state. Review notes stay in the browser. No private server is included in the public Pages deployment.

## Local setup

1. Install Node.js 24 LTS or newer, then run `npm ci` and `npm run build`.
2. Copy `.env.example` to `.env`. Generate a random bootstrap token with the command shown there and store it privately. Keep the default loopback bind.
3. Start with `npm start`. Open **http://localhost:4318/?mode=live#access**, using `localhost` consistently; an IP address is a different WebAuthn origin.
4. Enter the setup token in the local form and register your passkey using your own authenticator. Save the ten one-time recovery codes separately. Existing credentials are not removed.
5. Sign out, sign in with the passkey, and check that an invalid credential or origin is rejected. The application cannot do your biometric/PIN/touch interaction for you.

Without Microsoft credentials, passkey access still works, but the workspace clearly reports that the data source is not configured. Never substitute sample data for this failure.

## Optional Microsoft connection

Create or reuse a dedicated application with only the required **application reading permissions** listed in [API-COVERAGE.md](API-COVERAGE.md). Obtain tenant-admin consent through the normal organizational process. Put the identifiers and secret in the server's `.env` or an appropriately protected secret store. Do not prefix credentials with `VITE_` and do not enter them into the public demo. Restart only your private server after changing its environment.

The adapter supports the global Microsoft cloud. The application does not request or perform remediation. It intentionally excludes live operations whose documented grants are write-capable. Start with the smallest useful scope and confirm availability for your license.

## A stable HTTPS deployment

Before exposing a server, choose your own stable hostname, configure valid TLS at the reverse proxy and set `APP_ORIGIN=https://your-hostname` and `RP_ID=your-hostname`. They must match exactly. Forward requests to the loopback application. There is no wildcard-origin configuration and no automatic public tunnel. Do not change the origin after enrolling credentials unless you have a tested migration and recovery plan.

This repository does not create a public server, buy infrastructure, change DNS or open firewall ports. Deployments must preserve the host's security policy. A multi-user or multi-tenant rollout needs a separate authorization design.

## Backup and recovery

Stop only this private server cleanly before copying its SQLite database and associated state, or use a SQLite-aware online backup process. Protect backups as authentication data; test restoration with the same RP ID/origin. Never commit database files or recovery codes. An existing valid passkey can add another passkey. A one-time recovery code creates a ten-minute session that can register a replacement; it cannot read tenant security data before passkey registration. Recovery preserves existing credentials and source data.
