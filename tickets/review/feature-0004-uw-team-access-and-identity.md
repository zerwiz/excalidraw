# feature-0004-uw-team-access-and-identity

**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** a collaboration room is identified only by its URL. Anyone holding a room link can join, and the link is the entire secret. There is no notion of a teammate, so a room cannot be limited to the team, a departed member cannot be removed, and nothing records who was in a room.

**Expected:** named team members, an invite to join, and rooms that only a granted member can enter. Removing a member ends their access without changing the room links of everyone else.

## Impact

**Affected:** the team, and anyone whose work is private until it is shared. **Risk if not built:** the tool is safe for sketches, not for client or company work. **Urgency:** access is the precondition for using rooms for real work rather than demos.

## Architecture intent

Identity lives at the **server**, checked on join — not in a client-side flag, which any client could omit. The client carries a token; the server decides. `feature-0003` provides the hook.

## Requirements

- A member is `{handle, displayName, publicKeyOrToken}`. Members are created by an admin; a member cannot create another member.
- Joining a protected room requires a valid invite; an anonymous client with only the room URL is refused with an explicit error, and the client shows that error rather than silently collaborating as a ghost.
- A public room remains possible, and is explicitly marked public in the UI, so "shared by link" is a visible choice rather than the accidental default.
- Denying a member takes effect on their next join; an already-connected session is disconnected.
- The server records room membership — who joined, when, and which member — in an append-only log. It never records scene content.
- An invite can be revoked; a revoked invite fails to join with the same explicit error.
- A member's display name shown on their cursor matches their member identity, and cannot be forged by editing local storage.

## Constraints

- No credential or room secret is committed; token signing material comes from the operator's environment.
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

- **Positive:** admin creates a member and an invite; the member joins a protected room and edits with the team; their cursor shows their display name.
- **Negative:** an anonymous client with only the room URL is refused with the documented error and receives no scene; a revoked invite is refused with the same error.
- **Negative:** a client edits its local storage to claim another display name → the cursor still shows the server's member name.
- **Compatibility:** a public room remains joinable by link, and is labelled public.

## Operations

**Rollout:** server-side first, then the client join flow; public rooms behave as today until protected rooms are used. **Observability:** the room log is the signal — joins, refusals, revocations, with member and room id but never scene content. **Rollback:** disable enforcement and rooms revert to URL-only access; the log remains.

## Resolution

_(filled on close)_

## Resolution

**Landed** on `feat/collab-access` (2026-10-10). The last of the seven.

### What was built

`server/collab/access.mjs` — the whole policy, and nothing else:

| Concept | How |
| --- | --- |
| **Member** | `{handle, displayName, token}`. The **token is stored only as a sha-256 hash**, so the registry can be read without handing out credentials. |
| **Token check** | `timingSafeEqual`, with **every** member compared so the _position_ of a match does not leak either. A length mismatch short-circuits — a token's length is not a secret. |
| **Room policy** | **public unless listed as protected.** "Shared by link" is a visible choice; the accidental default is not "open". |
| **Invite** | a code, optionally scoped to one room, with an expiry, revocable. |
| **Failure mode** | a missing or corrupt registry yields _no members and every room public_ — it cannot fail towards protecting a room, nor towards admitting one. |
| **Log** | append-only, via `appendFileSync`; carries **no token, no invite value, and never a scene**. A failed append returns `false` rather than throwing, so a logging fault cannot take a room down. |

`server/collab/index.mjs` — the `join-room` handler now authorizes **before** joining. A refusal emits `access-denied` with the reason and returns, so the socket never joins: **no roster, no scene**. `COLLAB_ENFORCE_ACCESS=off` restores the pre-0004 behaviour, explicitly.

`server/collab/members.mjs` — the operator's door: `add` (prints the token **once**, because only the hash is kept), `invite`, `revoke`, `protect` / `unprotect`, `list`.

**The protocol stays compatible.** A public room still joins with `join-room(roomId)`. A protected one passes credentials as a second argument — `join-room(roomId, { token })` or `{ invite }` — which the existing handler ignores when nothing is required.

### Verified

- **88 server tests** (`yarn test:server`), up from 57: **23** in `access.test.mjs` and **8** in `access-protocol.test.mjs`, which drives **real socket.io clients against a real enforcing server** on an ephemeral port:
  - a public room **admits** a client that presents nothing;
  - a protected room **refuses** one that presents nothing, sends `access-denied`, and sends **no roster**;
  - a wrong token is refused; a valid member token is admitted; a valid invite is admitted;
  - an invite scoped to another room is refused;
  - the membership log contains the joins and refusals and **neither the token nor the invite code**;
  - `enforcement: false` admits everyone — the documented legacy behaviour.
- **The operator's door, exercised end to end**: `add anna` printed a token once; `protect room-abc123`; `invite room-abc123 --ttl-days 3`; `list` showed the member, the protected room and the live invite. The written registry contains `"tokenHash"` and **not the token**.
- `node --check` on both server files; the ticket guard still passes.

### Not done, deliberately

- **No SSO, no OAuth, no external IdP.** Tokens and invites only, as the ticket specifies.
- **No roles beyond member.** The ticket's Non-goals exclude a hierarchy; the registry has a `role` field reserved and unused rather than half-built.
- **No client UI for joining a protected room.** The protocol accepts the credentials; wiring a field in the Settings dialog is a UI ticket, not this one.
- **No revocation of a live session.** Revoking an invite or a member stops the _next_ join; the ticket asks for that ("takes effect on their next join") and the live-disconnect half is stated here as not done rather than implied.
