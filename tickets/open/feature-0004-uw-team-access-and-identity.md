# feature-0004-uw-team-access-and-identity

**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** a collaboration room is identified only by its URL. Anyone holding a room link can
join, and the link is the entire secret. There is no notion of a teammate, so a room cannot be
limited to the team, a departed member cannot be removed, and nothing records who was in a room.

**Expected:** named team members, an invite to join, and rooms that only a granted member can
enter. Removing a member ends their access without changing the room links of everyone else.

## Impact

**Affected:** the team, and anyone whose work is private until it is shared.
**Risk if not built:** the tool is safe for sketches, not for client or company work.
**Urgency:** access is the precondition for using rooms for real work rather than demos.

## Architecture intent

Identity lives at the **server**, checked on join — not in a client-side flag, which any client
could omit. The client carries a token; the server decides. `feature-0003` provides the hook.

## Requirements

- A member is `{handle, displayName, publicKeyOrToken}`. Members are created by an admin; a
  member cannot create another member.
- Joining a protected room requires a valid invite; an anonymous client with only the room URL
  is refused with an explicit error, and the client shows that error rather than silently
  collaborating as a ghost.
- A public room remains possible, and is explicitly marked public in the UI, so "shared by link"
  is a visible choice rather than the accidental default.
- Denying a member takes effect on their next join; an already-connected session is disconnected.
- The server records room membership — who joined, when, and which member — in an append-only
  log. It never records scene content.
- An invite can be revoked; a revoked invite fails to join with the same explicit error.
- A member's display name shown on their cursor matches their member identity, and cannot be
  forged by editing local storage.

## Constraints

- No credential or room secret is committed; token signing material comes from the operator's
  environment.
- The access check is server-side; the client's refusal to render is UX, never the control.
- Token comparison is constant-time; tokens have an expiry.
- The room log is append-only, like `tickets/` and `RULES/`.
- Access failure never deletes or corrupts a room's stored scene.

## Non-goals

- Not SSO, OAuth or an external identity provider in this ticket.
- Not an organisation hierarchy, teams-within-teams, or roles beyond admin/member.
- Not encrypting room contents at rest.
- Not a billing or seat-count surface.

## Test cases

- **Positive:** admin creates a member and an invite; the member joins a protected room and edits
  with the team; their cursor shows their display name.
- **Negative:** an anonymous client with only the room URL is refused with the documented error
  and receives no scene; a revoked invite is refused with the same error.
- **Negative:** a client edits its local storage to claim another display name → the cursor
  still shows the server's member name.
- **Compatibility:** a public room remains joinable by link, and is labelled public.

## Operations

**Rollout:** server-side first, then the client join flow; public rooms behave as today until
protected rooms are used.
**Observability:** the room log is the signal — joins, refusals, revocations, with member and
room id but never scene content.
**Rollback:** disable enforcement and rooms revert to URL-only access; the log remains.

## Resolution

*(filled on close)*
