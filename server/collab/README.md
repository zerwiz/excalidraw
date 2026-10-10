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
- `protocol.test.mjs` — **two real socket.io clients against a real server** on an
  ephemeral port: `init-room`, `first-in-room`, `new-user`, the roster, encrypted-payload
  relay, that a socket in another room receives nothing, scene replay to the first member
  of an emptied room, that a second member is *not* replayed to (the peer serves them),
  that a volatile payload is never persisted, `user-follow` relay, departure announcement,
  malformed room-id refusal, and `/healthz`.

## Follow-up

`feature-0004` builds access control on top of this: named members, invites, and a
room that only a granted member can enter. The hook for it is the `join-room` handler.
