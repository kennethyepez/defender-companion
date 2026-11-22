# Defender Companion

A mobile-first workspace for reviewing security alerts, following evidence and understanding device exposure. Built with React, TypeScript and an optional passkey-protected Node server.

**[Explore the public demo](https://kennethyepez.github.io/defender-companion/)** · [Architecture](docs/ARCHITECTURE.md) · [Security model](SECURITY.md) · [Private deployment](docs/PRIVATE-DEPLOYMENT.md)

![Desktop overview](docs/screenshots/overview-desktop.jpg)

The public demo contains entirely fictional records. It needs no account, Microsoft tenant or API key. It never contacts a Microsoft security service, changes endpoint settings, or closes an alert.

## Try it locally

Use **Node.js 24 LTS or newer** and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`, then `npm run preview`.

## What you can review

- **46 addressable screens** across alerts, evidence, devices, software, exposure, investigation context, notifications, settings and failure states.
- **A complete investigation path:** overview → alert → evidence → process/file/registry context → a local review note.
- **Search and filters** with no-results recovery, selected device context, and source status preserved across review actions.
- **Local review notes, notification preferences and JSON exports.** Acknowledging a reminder never resolves the source alert.
- **Responsive layouts:** a sidebar workspace on desktop and five destinations in the mobile navigation.
- **An optional private server:** actual WebAuthn registration/authentication, one-time recovery codes, expiring server sessions, and allowlisted Microsoft read adapters.

<img src="docs/screenshots/overview-mobile.jpg" alt="Mobile overview with a priority alert and the next investigation step" width="320" />

## Two explicit data modes

|                  | Public demo                                      | Optional private workspace                        |
| ---------------- | ------------------------------------------------ | ------------------------------------------------- |
| Data             | Invented fixtures and reserved example addresses | Server-side Microsoft API reads                   |
| Human access     | No account needed for fictional data             | Passkeys, user verification and one-time recovery |
| Credentials      | None                                             | Environment variables on the server only          |
| Reviews          | Local to the browser                             | Local to the browser; not written to Defender     |
| Endpoint changes | None                                             | None                                              |
| Notifications    | Local inbox and saved preferences                | Same; external push/voice is not connected        |

The private adapters cover alerts, incidents, machines, software, vulnerabilities and recommendations. Investigations, past machine actions and indicators remain **demo-only** because their documented Microsoft read operations require broader write-capable grants. This project deliberately does not request those grants. Entities and scan progress also have no live provider in this release. See [API coverage](docs/API-COVERAGE.md) for permissions and official sources.

## Engineering review

```sh
npm run check          # strict types, test suite, production build
npm run format:check   # source formatting
npm audit             # advisory check for the locked dependency tree
```

Tests cover filter semantics, immutable source records, all routes, local note persistence, reminder acknowledgement, session expiry/revocation, single-use challenges, bootstrap authorization, origin checks, invalid authentication responses, recovery restrictions, read-only route boundaries, partial provider failures, bounded pagination and SSRF protection.

GitHub Actions runs the checks before publishing the fixture-only demo. The server is not deployed by that workflow, and GitHub Pages receives no tenant credentials or private data.

### Code map

```text
src/
  App.tsx             Application state, navigation and screen composition
  components.tsx      Shared semantic UI primitives and native dialog
  domain.ts           Runtime schemas and pure data operations
  sample-data.ts      Entirely fictional public records
  navigation.ts       Typed 46-screen catalog and parent relationships
  Access.tsx          Private passkey enrollment, login and recovery
  api.ts              Same-origin private API client and export helper
server/
  app.ts              Authentication and read-only HTTP routes
  store.ts            SQLite credentials, hashed sessions and recovery state
  microsoft.ts        Fixed upstream paths, mapping and bounded reading
tests/                Domain, UI, storage, HTTP and adapter regressions
docs/                 Architecture, decisions, API coverage and deployment
```

## Scope and limits

This is a portfolio application with a working public demo and an optional single-administrator private server. It is **not a replacement for Microsoft Defender**, a certified security product, a forensic tool or proof that a device is clean. No real tenant has been connected to the public deployment. Production multi-user authorization, external notification delivery, event streaming and remediation are outside this release.

The design adapts the approved light/violet mobile reference into a security investigation workflow. It uses original UI code, system fonts and no third-party product logos. Microsoft Defender is a Microsoft product; this project is independent and unaffiliated.
