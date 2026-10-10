# feature-0003-uw-self-hosted-collaboration-server

**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** realtime collaboration runs on a WebSocket server named by `VITE_APP_WS_SERVER_URL` — `oss-collab.excalidraw.com` in production (`.env.production:15`), `localhost:3002` in development. Room persistence and shared-file uploads go to Firebase (`excalidraw-app/data/firebase.ts`, `excalidraw-app/collab/Portal.tsx`, `FIREBASE_STORAGE_PREFIXES` in `excalidraw-app/app_constants.ts`). The team cannot collaborate without Excalidraw's servers, and cannot collaborate privately at all.

**Expected:** a collaboration server the team runs itself, on `zerwizserver`, speaking the protocol the client already speaks. A teammate joins a room by URL and the scene syncs — with no request to any Excalidraw-controlled host.

## Impact

**Affected:** everyone. This is the difference between a demo and a tool the team works in. **Risk if not built:** "collaborate" stays a feature of someone else's service, and every room is on a host the team does not control. **Urgency:** paired with feature-0004 (access) it is the product; without it the fork is a single-player editor.

## Architecture intent

Reuse the client protocol as-is and write only the server: the `socket.io-client` protocol and the `WS_EVENTS` / `WS_SUBTYPES` contract in `excalidraw-app/app_constants.ts` are the interface, and changing them would break every client for no gain. The server is the new part.

## Requirements

- A server exists in this repository under `server/collab/` (or equivalent), started by a script, that implements the room protocol the client already sends: `server-broadcast`, `server-volatile-broadcast`, `user-follow`, `user-follow-room-change`, and the `SCENE_INIT`, `SCENE_UPDATE`, `MOUSE_LOCATION`, `IDLE_STATUS`, `USER_VISIBLE_SCENE_BOUNDS` subtypes.
- Two browser sessions at the same room URL see each other's edits, cursors and follow-mode changes within 1 second on a LAN.
- Room state survives a client reload: a reconnecting client receives `SCENE_INIT` with the room's current scene even if no other client is connected.
- Scene persistence and file storage are **local disk or a self-hosted store**, configured by path/URL. No Firebase, no `googleapis.com`, no `excalidraw.com`.
- The client resolves the server URL from **Settings** (`feature-0002`), not from a compiled env literal; the env var seeds a default only.
- With the collaboration server unreachable, the editor still opens, saves locally and exports. Collaboration degrades to a visible "not connected" state; it never blocks drawing.
- The server refuses to serve a room to a client that has not been granted access (`feature-0004`); this ticket provides the hook, feature-0004 the policy.

## Constraints

- **Protocol compatibility is the contract.** An unmodified client build must be able to talk to the server; the server adapts to the client, not the reverse.
- The `.excalidraw` export format is untouched.
- No secret is committed: TLS material and any room token come from the operator's environment.
- The server binds localhost by default; exposing it is an explicit, documented operator step.
- Bounded resources: a room's stored scene and uploaded files have configured ceilings, and the server refuses rather than growing without limit.

## Non-goals

- Not identity or access control — that is feature-0004.
- Not a hosted multi-tenant service; one deployment, one team.
- Not changing the collaboration UX (the share dialog, cursors, follow mode) — only where the data goes.
- Not end-to-end encryption of room contents in this ticket.
- Not migrating Firebase's existing rooms; there is nothing to migrate.

## Test cases

- **Positive:** two browser profiles, same room URL on the self-hosted server → an edit in one appears in the other within 1 s; cursors track; follow mode follows.
- **Positive:** close both clients, reopen one at the same room URL → the scene is restored from the server.
- **Negative:** stop the server, keep editing → the editor works, saves locally, exports; the collaboration state shows not-connected; no request retries to `*.excalidraw.com` or `*.firebaseio.com`.
- **Compatibility:** a room created before a server restart is still joinable after it.

## Operations

**Rollout:** deploy on `zerwizserver` behind TLS; point Settings at it. Ship the server script in-repo so a second machine can run its own. **Observability:** the server logs each room create/join/leave with room id (never scene content); a health endpoint reports connected-room count. **Rollback:** point Settings back to localhost or stop the server. Because the client degrades to local-only, rollback does not strand a document.

## Resolution

_(filled on close)_

## Resolution

**Landed** on `feat/collab-server` (2026-10-10).

### The server

`server/collab/` — a self-hosted room server speaking **the protocol the client already speaks**, so no client change is needed beyond pointing Settings at it:

| File | What |
| --- | --- |
| `rooms.mjs` | the pure state: `RoomStore` (join/leave rosters, last-scene storage, TTL sweep), payload and room-id validation, `readConfig`. |
| `index.mjs` | the socket.io wiring, exported as `createCollabServer` so tests can bind an ephemeral port. |
| `rooms.test.mjs` · `protocol.test.mjs` | 13 + 11 tests. |
| `README.md` · `start.sh` | how to run it. |

`socket.io@4.8.4` added as a root devDependency (the client is `socket.io-client@4.8.1`).

**The server cannot read a room.** The room key lives in the URL _fragment_, which a browser never sends, so every payload arrives already encrypted and the server relays opaque bytes. It follows that it cannot merge scenes or resolve conflicts — those stay on the clients, as they already were.

### Requirements, met

- **The protocol is implemented exactly**: `init-room` on connect; `first-in-room`, `new-user`, `room-user-change`, `client-broadcast`, `user-follow-room-change` to clients; `join-room`, `server-broadcast`, `server-volatile-broadcast`, `user-follow` from clients.
- **Persistence, scoped to the case the server owns.** The last _non-volatile_ payload is stored per room and replayed to the **first member of an emptied room** — so a room survives everyone leaving. A later joiner is served by a **peer** via `new-user`, which is the existing protocol; the server does not duplicate it. A volatile payload (a cursor) is **never** persisted, and that is tested.
- **Degrades to local.** With no server configured, `initializeRoom` refuses (feature-0001); the editor keeps working.
- **Binds localhost** by default; origins restricted to the local app.
- **Bounded**: room ids `[A-Za-z0-9_-]{6,64}`, an 8 MiB payload cap, a 16 MiB stored-scene cap, a 30-minute TTL on empty rooms, and a sweep that logs only when it drops something.
- **The hook for feature-0004** is the `join-room` handler, as its README says.

### Verified

- **24 server tests**, of which **11 drive two REAL socket.io clients against a REAL server** on an ephemeral port — nothing mocked: `init-room`, `first-in-room`, `new-user`, the roster, encrypted-payload relay, **that a socket in another room receives nothing**, scene replay to the first member of an emptied room, **that a second member is not replayed to**, that a volatile payload is never persisted, `user-follow` relay, the departure roster, malformed-room-id refusal, and `/healthz`.
- `yarn test:server` → **57 tests** across all three services. `yarn test:typecheck` clean.
- **Live, against this machine:** the server came up on `:3002`, `/healthz` reported `{"rooms":0,"members":0}`; starting a session in the browser created a room URL and the roster went to **1**; a **second browser session** opened the same room URL and the roster went to **2**, with the client's collaboration control reading **2** and a peer avatar rendered. Screenshot: `/tmp/collab-page3.png`.

### NOT verified — stated plainly

- **A human-drawn element crossing between the two browser tabs is unverified.** The tooling available to me could not produce a real canvas drag (synthetic pointer events produced a degenerate dot, and the CDP drag helper only moves one DOM element onto another). What _is_ proven is that an encrypted payload posted by one client is received by another in the same room — the protocol tests do exactly that. The end-to-end visual check remains **manual and owed**.
- **Not deployed to `zerwizserver`.** The server runs locally and is proven locally; shipping it to the box needs the Allfather's route and word.
- **No TLS.** It binds localhost; exposing it needs a certificate and a proxy, which is a deployment step, not a code change.
