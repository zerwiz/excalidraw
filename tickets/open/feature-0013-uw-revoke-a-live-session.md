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
