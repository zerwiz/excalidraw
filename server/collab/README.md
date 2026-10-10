# Collaboration server

A self-hosted room server for this fork. It speaks **the protocol the client already
speaks** — the events in `excalidraw-app/app_constants.ts` — so no client change is
needed beyond pointing Settings at it.

```
client ──▶  join-room · server-broadcast · server-volatile-broadcast · user-follow
client ◀──  init-room · first-in-room · new-user · room-user-change
            client-broadcast · user-follow-room-change
```

## Run

```bash
node server/collab/index.mjs          # ws://127.0.0.1:3002
```

Then set **Settings → Collaboration server** to `http://localhost:3002`.

## The property that matters

**The server cannot read a room.** The room key lives in the URL **fragment**, which a
browser never sends to a server, and every scene payload arrives already encrypted. The
server relays opaque bytes and stores the last one. That is the whole design, and it is
why a compromised or curious server does not leak a whiteboard.

It also means the server cannot merge scenes, resolve conflicts, or inspect content —
those happen on the clients, as they already did.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `COLLAB_PORT` | `3002` | listen port |
| `COLLAB_HOST` | `127.0.0.1` | bind interface — localhost by default |
| `COLLAB_ORIGINS` | `http://localhost:4172,http://127.0.0.1:4172` | allowed CORS origins |

## How a join works

1. The server emits `init-room` on connect; the client then sends `join-room`.
2. **First member** → `first-in-room`. If the server holds the room's last encrypted
   scene it also replays it as `client-broadcast`, and the client — which has the key
   from the URL fragment — can read what the server cannot. This is what makes a room
   survive everyone leaving.
3. **Later members** → the others receive `new-user`, and they broadcast the scene in
   reply. The newcomer is served by a **peer**, not by the server; that is the existing
   protocol and the server does not duplicate it.
4. Everyone receives `room-user-change` with the roster, and a departure announces a
   fresh roster to the rest.

## Bounds

- A room id must match `[A-Za-z0-9_-]{6,64}`; anything else is ignored, not joined.
- A single payload is capped at 8 MiB; a stored scene at 16 MiB.
- An **empty** room keeps its scene for 30 minutes and is then swept. The sweeper runs
  once a minute and logs only when it drops something.
- A malformed payload is dropped rather than relayed.

## Logging

The server logs a sweep line (`{event, dropped, rooms, members}`) and nothing else. It
never sees a prompt, a scene, or a room key, so there is nothing else it *could* log.

## Tests

```bash
yarn test:server        # or: node --test server/collab
```

- `rooms.test.mjs` — the pure state: join/leave rosters, scene storage (including the
  oversized refusal), the TTL sweep, and that an occupied room is never swept.
- `access.test.mjs` — tokens (hashing, constant-time comparison, nothing raw on disk),
  invites (scoped, expired, revoked, unknown), public vs protected, and that the log
  appends and carries no secret.
- `access-protocol.test.mjs` — **real clients against a real enforcing server**: a public
  room admits with nothing; a protected room refuses with nothing and sends no roster,
  refuses a wrong token, admits a valid token, admits a valid invite, refuses an invite
  scoped elsewhere; the log holds no token or invite value; enforcement `off` admits all.
- `protocol.test.mjs` — **two real socket.io clients against a real server** on an
  ephemeral port: `init-room`, `first-in-room`, `new-user`, the roster, encrypted-payload
  relay, that a socket in another room receives nothing, scene replay to the first member
  of an emptied room, that a second member is *not* replayed to (the peer serves them),
  that a volatile payload is never persisted, `user-follow` relay, departure announcement,
  malformed room-id refusal, and `/healthz`.

## Access and identity (feature-0004)

The server cannot read a room — but it can decide **who may enter one**, and it does,
server-side. A client cannot opt out by omitting a flag.

**A room is public unless it is listed as protected.** "Shared by link" is therefore a
visible choice, never the accidental default.

| | |
|---|---|
| **Member** | `{handle, displayName, token}` — the **token is stored only as a sha-256 hash**, so the registry can be read without handing out credentials, and comparison is **constant-time** |
| **Invite** | a code, optionally scoped to one room, with an expiry; revocable |
| **Refusal** | the client receives `access-denied` with the reason, and **no roster** |
| **Log** | joins, refusals and revocations are appended — and it carries **no token, no invite value, and never a scene** |

```
COLLAB_MEMBERS        the registry file (default server/collab/members.json)
COLLAB_ACCESS_LOG     the append-only membership log
COLLAB_ENFORCE_ACCESS `off` admits everyone (the pre-0004 behaviour); anything else enforces
```

### The operator's door

```bash
node server/collab/members.mjs add anna "Anna Andersson"   # prints the token ONCE
node server/collab/members.mjs protect room-abc123
node server/collab/members.mjs invite room-abc123 --ttl-days 3
node server/collab/members.mjs revoke <code>
node server/collab/members.mjs list
```

`add` prints the token once and cannot print it again — only the hash was kept.

### How a client joins a protected room

The protocol is unchanged for a public room. For a protected one the client sends
credentials as a second argument, which the existing handler ignores when nothing is
required:

```js
socket.emit("join-room", roomId, { token });   // or { invite: code }
```

A missing or wrong credential yields `access-denied` and the socket never joins, so it
receives no roster and no scene.
