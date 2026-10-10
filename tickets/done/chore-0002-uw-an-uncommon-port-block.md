# chore-0002-uw-an-uncommon-port-block

**Type** chore · **Status** done · **Risk** low · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the services chose ports the rest of the world also chooses — `3002` for the room server (next to every Node app's 3000) and `4173`, which is Vite's own `preview` port and will be taken on a machine running any Vite project. Collisions produce a service that is up and unreachable, or a preview that cannot start. **Expected:** the fork owns **one contiguous, uncommon block**, stated once.

## Impact

**Affected:** every install. A collision is silent and looks like a broken service.

## Architecture intent

Ports are configuration with **one documented default per service**; the block is chosen to be memorable and to collide with nothing else on the machine.

## Requirements

- The fork uses **7311 app · 7312 collab · 7313 bridge · 7314 tickets board**, everywhere: the service defaults, both `.env.example` files, the desktop shell, CORS origin lists, the docs, and the ymir door.
- Each service reads its port from env with that default.
- Nothing outside `tickets/` history still names the old block.
- Collab gains a `.env.example` and a `start.sh` that sources `.env`, like the bridge.

## Non-goals

Not a port registry; not dynamic port selection.

## Test cases

- **Positive:** `grep` for the old ports outside `tickets/` returns nothing.
- **Negative:** each service still binds when its env var is set to something else.
- **Compatibility:** the app starts, the tests pass, and the gates stay clean.

## Resolution

**Landed.** Defaults moved in `tickets.mjs`, `bridge.mjs`, `rooms.mjs`, `desktop/{start.sh,main.js}`, `.env.development`, `.env.test`, the `.env.example`s, the CORS lists, the READMEs, the Settings hints, the settings tests and the ymir door. `server/collab/.env.example` added and its `start.sh` now sources `.env`. Scan is clean; app verified listening on `:7311`.
