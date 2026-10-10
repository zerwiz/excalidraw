# feature-0001-uw-sever-all-excalidraw-hosted-connections

**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the app is wired to Excalidraw's hosted services and to third parties. With the shipped configuration it contacts, or will contact on user action:

| Surface | Where | Host |
| --- | --- | --- |
| Scene share/persist backend | `.env.production:3-4` | `json.excalidraw.com` |
| Library catalogue + publish backend | `.env.production:6-7` | `libraries.excalidraw.com`, `us-central1-excalidraw-room-persistence.cloudfunctions.net` |
| Excalidraw+ landing / app | `.env.production:9-10` | `plus.excalidraw.com`, `app.excalidraw.com` |
| AI text-to-diagram backend | `.env.production:12` | `oss-ai.excalidraw.com` |
| Collaboration WebSocket | `.env.production:15` | `oss-collab.excalidraw.com` |
| Firebase (auth, collab file storage, share-link files) | `.env.production:17`, `excalidraw-app/data/firebase.ts`, `excalidraw-app/app_constants.ts` (`FIREBASE_STORAGE_PREFIXES`) | `*.firebaseio.com`, `*.googleapis.com` |
| Error reporting | `excalidraw-app/sentry.ts`, `excalidraw-app/index.tsx`, `excalidraw-app/components/TopErrorBoundary.tsx` | Sentry |
| Telemetry | `VITE_APP_ENABLE_TRACKING=true` (`.env.development:22`), `trackEvent` in `excalidraw-app/App.tsx`, `share/ShareDialog.tsx`, `collab/Portal.tsx` | Vercel/Vercel-analytics |
| Excalidraw+ session cookie | `excalidraw-app/app_constants.ts` (`COOKIES.AUTH_STATE_COOKIE = "excplus-auth"`) | n/a |

**Expected:** the app boots, draws, saves, exports and collaborates **without contacting any Excalidraw-controlled or third-party host**, unless the operator has explicitly pointed it at one. Hosted endpoints are opt-in configuration, never a built-in default.

## Impact

**Affected:** everyone using the tool. Today the fork leaks usage data, error reports and document content to hosts the team does not control, and cannot run on an air-gapped machine. **Risk if not built:** the tool cannot be adopted for private work; "self-hosted" is a claim the code does not support. **Urgency:** this is the precondition for every other ticket here — the collaboration server (feature-0003), the settings page (feature-0002) and the AI backend (feature-0005) all presuppose that the inherited endpoints are gone.

## Architecture intent

Sever the inherited connections at their **configuration boundary** first — one module that resolves every endpoint — so the remaining tickets have a single seam to point at `zerwizserver` instead of chasing literals through the tree.

## Requirements

- With the default configuration and no network, the app opens, draws, saves locally and exports a scene. No request is attempted to any host in the table above.
- `grep -rInE 'excalidraw\.com|firebaseio\.com|excalidraw-room-persistence|oss-ai\.excalidraw|sentry' excalidraw-app packages/*/src --include='*.ts' --include='*.tsx'` returns no **runtime** URL, host literal or project id. Comments and this ticket are exempt.
- Error reporting is off unless `VITE_APP_SENTRY_DSN` (or equivalent) is set by the operator; with it unset the Sentry dependency is never initialised.
- Telemetry is off by default. `VITE_APP_ENABLE_TRACKING` unset, empty, or `false` sends nothing.
- The Excalidraw+ session cookie is not read or written. `isExcalidrawPlusSignedUser` is removed rather than stubbed, and its call sites are updated.
- The app must refuse to use a hosted default: if a hosted-backend env var is absent, the feature degrades to local-only (share link → export file; library → local `.excalidrawlib`) or is hidden — it does not silently fall back to `*.excalidraw.com`.

## Constraints

- **No new dependency is introduced to replace a removed one.** This ticket removes.
- `.env.development` / `.env.production` stop shipping real keys and project ids; Firebase config, the Sentry DSN and the AI backend become operator-provided, documented, empty by default. No secret of Excalidraw's or the team's is committed.
- The collaboration **protocol** is not changed here — only the endpoint it points at. That is feature-0003.
- The export format (`.excalidraw` JSON) is unchanged: a scene exported before this ticket imports byte-identically after.
- Any capability that is hidden or removed updates the UI so nothing claims a feature that is no longer wired.

## Non-goals

- Not building the collaboration server (feature-0003) or the settings page (feature-0002).
- Not debranding the UI or removing promo surfaces (chore-0001).
- Not replacing Firebase's file storage with a self-hosted store — that is scoped inside feature-0003 for collab files and feature-0002 for share links.
- Not removing the Excalidraw library _format_; the local library stays.

## Test cases

- **Positive:** with the network disabled, fresh profile — open the app, draw a shape, reload (scene restored), export `.excalidraw` and `.png`. All succeed. Network log to `*.excalidraw.com`, `*.firebaseio.com`, `*.googleapis.com`, `*.sentry.io` is empty.
- **Negative:** with `VITE_APP_BACKEND_V2_POST_URL` unset, sharing a scene shows the local-export path and attempts no request; it does **not** POST to a hosted default.
- **Negative:** with `VITE_APP_ENABLE_TRACKING=false`, `trackEvent` is a no-op and no beacon is sent.
- **Compatibility:** a `.excalidraw` file exported before this change imports unchanged; `yarn test:app --watch=false` passes with only the tests that asserted the removed surfaces updated or deleted.

## Operations

**Rollout:** a normal branch + PR. Teams that want a hosted backend set the env vars themselves. **Observability:** the browser network panel is the signal; a captured HAR attached to the PR shows only localhost/`zerwizserver` origins. **Rollback:** revert the commit. Because endpoints become configuration, rolling back does not require a data migration.

## Resolution

_(filled on close)_

## Resolution

**Landed** on `feat/sever-hosted-connections` (2026-10-10).

### The seam

New module `excalidraw-app/endpoints.ts` resolves **every** remote host in one place and exposes a `features` map. An endpoint that is unset yields a feature that is _unavailable_ — never a fallback to a hosted default. This is the module `feature-0002` will make operator-configurable.

### What changed

| Surface | Change |
| --- | --- |
| `.env.development`, `.env.production` | every hosted endpoint **emptied**; the Firebase config and the Excalidraw+ export public key are **gone**; tracking stays `false`. Comments state the rule. |
| `sentry.ts` | gated on `VITE_APP_SENTRY_DSN`; the hardcoded DSN and the `excalidraw.com` hostname allow-list are removed. Unset → `Sentry.init` never runs, and the feature-flags block is skipped with it. |
| `data/firebase.ts` | `isFirebaseConfigured()` added; `_initializeFirebase` refuses; `saveToFirebase`, `saveFilesToFirebase` and `loadFilesFromFirebase` are inert without a config. No request leaves the process. |
| `data/index.ts` | reads the endpoints module; `importFromBackend` throws `EndpointNotConfiguredError`; `exportToBackend` returns a `null` url with that message. |
| `collab/Collab.tsx` | `initializeRoom` refuses when no collab server is configured, on the same line the socket used to be opened. |
| `components/AI.tsx` | `AIComponents` renders `null` when no AI backend is set (feature-0005 adds the "no model configured" state). |
| `LibraryMenuBrowseButton.tsx` | renders `null` with no library URL. |
| `PublishLibrary.tsx` | submits refuse with an explicit error with no library backend; the note link points at the configured URL or renders as plain text. |
| `.env.test` | a test-only `VITE_APP_WS_SERVER_URL` so the collab tests exercise a configured server (`socket.io-client` is mocked — nothing leaves the process). |
| `vite-env.d.ts` | `VITE_APP_SENTRY_DSN` declared. |

### Verified

- **`yarn test:app --watch=false` → 142 files passed, 2458 tests passed, 47 skipped, 1 todo.** (The collab suite initially failed because the emptied env removed its server; `.env.test` now configures one, which is the honest fix — the shipped default stays empty.)
- `yarn test:typecheck` → clean.
- `yarn build:app` → **built in 20.94s**, PWA 59 entries.
- `npx eslint --max-warnings=0` on every changed file → clean.
- **The severance measurement:** `grep -rInE 'json(-dev)?\.excalidraw\.com|libraries\.excalidraw\.com|oss-collab\.excalidraw\.com|oss-ai\.excalidraw\.com|plus\.excalidraw\.com|app\.excalidraw\.com|firebaseio\.com|excalidraw-room-persistence|sentry\.io|cloudfunctions\.net' excalidraw-app packages --include='*.ts' --include='*.tsx'` excluding `node_modules` and `/tests/` → **no matches.**

### Not done, deliberately

- **Firebase is inert, not removed.** The dependency and the encrypted-scene code stay until `feature-0003` provides the self-hosted room server and storage to replace them. Removing it now would break the collab protocol that 0003 needs intact.
- **The scene-sharing backend is guarded, not replaced.** Share links are unavailable until an operator configures one; a self-hosted share store is part of `feature-0003`.
- **No browser HAR check.** The network-log evidence the ticket asks for is owed — the grep and the suite prove no literal remains, but a captured session on a fresh profile has not been recorded. Stated as manual, not as done.
