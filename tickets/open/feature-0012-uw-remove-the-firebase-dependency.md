# feature-0012-uw-remove-the-firebase-dependency

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** `feature-0001` made Firebase **inert** without a config, but the dependency, the encrypted-scene code and the `firebase/*` imports are still in the tree. That was deliberate: the self-hosted room server (`feature-0003`) had to exist first and the client protocol had to stay intact. It exists now. **Expected:** the Firebase dependency is **gone** — no package, no module, no dead path — and the room server is the only storage.

## Impact

**Affected:** the install footprint and the honesty of the readme. An inert dependency still ships a large package and still argues that a hosted service is a possibility. **Risk if not built:** the next reader assumes Firebase is load-bearing and designs around it.

## Architecture intent

Delete, do not abstract. There is one storage path now, and a second one kept "just in case" is how a fork accumulates a second source of truth.

## Requirements

- `firebase` is removed from `package.json`; `data/firebase.ts` is deleted; no import of it remains.
- The shared-scene and file-upload paths that used it either use the room server or are removed.
- `VITE_APP_FIREBASE_CONFIG` and `isFirebaseConfigured` are gone.
- With no configuration, the app still saves locally, exports, and opens no socket.
- Tests that mocked `data/firebase.ts` are updated or removed rather than kept for a module that no longer exists.

## Non-goals

Not migrating existing Firebase data (there is none that matters); not replacing the room server.

## Test cases

- **Positive:** the full suite passes with the module deleted and the dependency uninstalled.
- **Negative:** `grep -r "firebase" --include='*.ts' --include='*.tsx' excalidraw-app packages` returns nothing outside lockfile and history.
- **Compatibility:** a scene saved before the removal still loads.

## Constraints

The export format is untouched. No new dependency replaces it.

## Resolution

_(filled on close)_
