# feature-0013-uw-revoke-a-live-session

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** revoking a member or an invite stops the **next** join, and that is what `feature-0004` promised. A client already inside a room stays inside until it leaves. **Expected:** revocation ends a live session too.

## Impact

**Affected:** anyone who has had to remove someone mid-session. "Takes effect next time" is a surprising answer when the person is on the canvas now.

## Architecture intent

Enforcement lives at the server, where the sockets are. The registry is re-read on revoke; the server, not the client, decides that the session ends.

## Requirements

- Revoking a member disconnects that member's live sockets from **protected** rooms and announces a fresh roster to those who remain.
- Revoking an invite does **not** disconnect anyone already admitted by it — an invite is a door, not a leash; say so in the UI.
- A disconnection is logged as a revocation in the append-only membership log.
- A revoked member re-joining is refused with the same explicit reason as before.

## Non-goals

Not session recording; not an admin UI; not per-room token scoping beyond what exists.

## Test cases

- **Positive:** with two clients in a protected room, revoking one disconnects it and the other sees a one-member roster.
- **Negative:** revoking an invite does not disconnect a client already in the room.
- **Compatibility:** a public room is unaffected.

## Constraints

The room server still cannot read a room; revocation touches membership, never content.

## Resolution

_(filled on close)_

---

## Resolution

**Landed** 2026-10-10.

### What it does now

- **The registry file is the trigger.** The room server watches it (`fs.watch`, `unref`'d so it never holds an event loop open) and on change re-reads it and checks every socket that joined **as a member**. A member who has gone is removed from their protected rooms, told `access-revoked` with the reason, and the rest are sent a fresh roster.
- **The socket remembers who it is.** `socket.data.member` is set at join, because a revocation has to be able to find a **live** session and the socket is where one lives.
- **An invite is a door, not a leash.** Revoking an invite does **not** disconnect anyone already admitted — and that is not a special case, it is structural: this path only ever looks at _members_.
- **The log says so**: a disconnection is appended as `{"event":"revoked", roomId, socketId, member}`.
- **`members.mjs remove <handle>`** is the operator's door for it, beside `add` / `invite` / `revoke <code>` / `protect`.

### Verified

- **113 server tests** (up from 111), including two new ones that drive **real socket.io clients against a real enforcing server**:
  - a member is revoked **while inside** a protected room → their socket receives `access-revoked`, the roster the others receive **no longer contains them**, and their next join is refused;
  - revoking an **invite** while a guest is inside leaves them connected — asserted by waiting and checking nothing fired.
- **A real bug the test caught**: the first implementation left the socket.io room but not the **store**, so the roster still listed the revoked name. `store.leave` was missing; the assertion found it.
- The CLI was exercised end to end: two members added, a room protected, `remove anna` dropped her and left `bo`.

### Not done, deliberately

**No revocation of a socket that joined a PUBLIC room.** A public room admits anyone by design, so there is no membership to revoke — the room would have to be protected first, which is the honest answer rather than a surprise.

**No admin UI.** The door is `members.mjs` and the registry file; a UI is `feature-0014`'s neighbourhood, not this ticket's.
