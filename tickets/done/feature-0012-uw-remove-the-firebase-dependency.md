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

---

## Resolution

**Landed** 2026-10-10. Firebase is **gone** — not inert, gone.

### What replaced it

The discovery that made this small: **the scene half was already redundant.** `feature-0003`'s room server stores the last payload it relayed and replays it to the first member of an emptied room, so `saveToFirebase` / `loadFromFirebase` / `isSavedToFirebase` and their Firestore document were duplicating a job the socket protocol already does. They are **deleted**, along with `queueSaveToFirebase` and `saveCollabRoomToFirebase`.

Only **files** needed a new home, so the room server gained one:

- `server/collab/files.mjs` — a bounded, path-safe blob store. `saveBlob` / `readBlob` / `removeBlob`, `safePath`, `roomFileKey`. An 8 MiB default bound, a result rather than a throw, and `safePath` as belt-and-braces over `isPlausibleKey`.
- Routes on the room server's HTTP side — `POST`/`PUT`/`GET /files/**` — with **CORS and a preflight**, which the REST side never had (only socket.io did), so a plain `fetch` to `/healthz` used to fail and look like a dead server.
- `excalidraw-app/data/roomFiles.ts` — `saveRoomFiles` / `loadRoomFiles` over HTTP to the room server, keeping the encrypt-then-upload shape: **the server stores opaque bytes it cannot read.**

**Renamed away from the vendor**: `FIREBASE_STORAGE_PREFIXES` → `ROOM_FILE_PREFIXES`, `fetchImageFilesFromFirebase` → `fetchImageFilesFromRoomServer`, and the file functions. `firebase` is removed from `package.json`; `data/firebase.ts` is deleted; the test mock now mirrors `roomFiles`.

### Verified

- **111 server tests** (up from 98): 13 for the file store — key plausibility, traversal refusal, round-trip, empty and oversized bodies, a tighter configured bound, an unconfigured store, a missing blob returning `null`, and removal.
- **Live:** `POST` → `{"ok":true,"bytes":22}`; `GET` returned the exact bytes; traversal → **404**; a missing blob → **404**; an empty body → refused with a reason.
- **145 test files / 2500 app tests**; typecheck, eslint and prettier clean.
- `grep -rn irebase excalidraw-app` → only the ticket reference in a comment. No import, no module, no dependency.

### Not done, deliberately

**No authentication on the file store.** A blob is addressed by an unguessable id, which is the capability — the same model the hosted storage used, and the same one the room's scene blob already follows. The app is public (`feature-0011`), so this is the point to revisit if that posture changes.
