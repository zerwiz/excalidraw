# feature-0003-uw-self-hosted-collaboration-server

**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** realtime collaboration runs on a WebSocket server named by
`VITE_APP_WS_SERVER_URL` — `oss-collab.excalidraw.com` in production (`.env.production:15`),
`localhost:3002` in development. Room persistence and shared-file uploads go to Firebase
(`excalidraw-app/data/firebase.ts`, `excalidraw-app/collab/Portal.tsx`,
`FIREBASE_STORAGE_PREFIXES` in `excalidraw-app/app_constants.ts`). The team cannot collaborate
without Excalidraw's servers, and cannot collaborate privately at all.

**Expected:** a collaboration server the team runs itself, on `zerwizserver`, speaking the
protocol the client already speaks. A teammate joins a room by URL and the scene syncs — with
no request to any Excalidraw-controlled host.

## Impact

**Affected:** everyone. This is the difference between a demo and a tool the team works in.
**Risk if not built:** "collaborate" stays a feature of someone else's service, and every room
is on a host the team does not control.
**Urgency:** paired with feature-0004 (access) it is the product; without it the fork is a
single-player editor.

## Architecture intent

Reuse the client protocol as-is and write only the server: the `socket.io-client` protocol and
the `WS_EVENTS` / `WS_SUBTYPES` contract in `excalidraw-app/app_constants.ts` are the interface,
and changing them would break every client for no gain. The server is the new part.

## Requirements

- A server exists in this repository under `server/collab/` (or equivalent), started by a script,
  that implements the room protocol the client already sends: `server-broadcast`,
  `server-volatile-broadcast`, `user-follow`, `user-follow-room-change`, and the `SCENE_INIT`,
  `SCENE_UPDATE`, `MOUSE_LOCATION`, `IDLE_STATUS`, `USER_VISIBLE_SCENE_BOUNDS` subtypes.
- Two browser sessions at the same room URL see each other's edits, cursors and follow-mode
  changes within 1 second on a LAN.
- Room state survives a client reload: a reconnecting client receives `SCENE_INIT` with the
  room's current scene even if no other client is connected.
- Scene persistence and file storage are **local disk or a self-hosted store**, configured by
  path/URL. No Firebase, no `googleapis.com`, no `excalidraw.com`.
- The client resolves the server URL from **Settings** (`feature-0002`), not from a compiled
  env literal; the env var seeds a default only.
- With the collaboration server unreachable, the editor still opens, saves locally and exports.
  Collaboration degrades to a visible "not connected" state; it never blocks drawing.
- The server refuses to serve a room to a client that has not been granted access
  (`feature-0004`); this ticket provides the hook, feature-0004 the policy.

## Constraints

- **Protocol compatibility is the contract.** An unmodified client build must be able to talk to
  the server; the server adapts to the client, not the reverse.
- The `.excalidraw` export format is untouched.
- No secret is committed: TLS material and any room token come from the operator's environment.
- The server binds localhost by default; exposing it is an explicit, documented operator step.
- Bounded resources: a room's stored scene and uploaded files have configured ceilings, and the
  server refuses rather than growing without limit.

## Non-goals

- Not identity or access control — that is feature-0004.
- Not a hosted multi-tenant service; one deployment, one team.
- Not changing the collaboration UX (the share dialog, cursors, follow mode) — only where the
  data goes.
- Not end-to-end encryption of room contents in this ticket.
- Not migrating Firebase's existing rooms; there is nothing to migrate.

## Test cases

- **Positive:** two browser profiles, same room URL on the self-hosted server → an edit in one
  appears in the other within 1 s; cursors track; follow mode follows.
- **Positive:** close both clients, reopen one at the same room URL → the scene is restored from
  the server.
- **Negative:** stop the server, keep editing → the editor works, saves locally, exports; the
  collaboration state shows not-connected; no request retries to `*.excalidraw.com` or
  `*.firebaseio.com`.
- **Compatibility:** a room created before a server restart is still joinable after it.

## Operations

**Rollout:** deploy on `zerwizserver` behind TLS; point Settings at it. Ship the server script
in-repo so a second machine can run its own.
**Observability:** the server logs each room create/join/leave with room id (never scene
content); a health endpoint reports connected-room count.
**Rollback:** point Settings back to localhost or stop the server. Because the client degrades
to local-only, rollback does not strand a document.

## Resolution

*(filled on close)*
