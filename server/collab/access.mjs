/**
 * Access and identity for the collaboration server.
 *
 * The server cannot read a room — but it can still decide **who may enter one**.
 * That is what this module does, and it is deliberately the only thing it does:
 * authorization is a server-side decision, never a client flag.
 *
 * `tickets/open/feature-0004-uw-team-access-and-identity.md`.
 *
 * Design notes that matter:
 *  - A member is `{handle, displayName, token}`. The **token is stored hashed**
 *    (sha-256), so the registry can be read without handing out credentials.
 *  - Comparison is **constant-time** (`timingSafeEqual`), so a wrong token cannot
 *    be narrowed by timing.
 *  - A room is **public unless it is listed as protected** — "shared by link" is a
 *    visible choice, and the accidental default is not "open".
 *  - Joins, refusals and revocations are appended to a log that carries **no scene
 *    content**, because the server never has any.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

export const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The empty registry: no members, no invites, every room public. */
export const emptyRegistry = () => ({
  members: [],
  invites: [],
  protectedRooms: [],
});

const isString = (value) => typeof value === "string" && value.trim() !== "";

export const hashToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

export const newToken = () => randomBytes(24).toString("base64url");

export const newInviteCode = () => randomBytes(12).toString("base64url");

/**
 * Constant-time string comparison. `timingSafeEqual` needs equal lengths, so a
 * length mismatch is short-circuited — the length of a token is not a secret.
 */
export const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  return timingSafeEqual(left, right);
};

/** Coerces whatever was stored into the current shape, dropping junk. */
export const normalizeRegistry = (input) => {
  if (!input || typeof input !== "object") {
    return emptyRegistry();
  }
  const members = Array.isArray(input.members)
    ? input.members
        .filter((member) => member && isString(member.handle) && isString(member.tokenHash))
        .map((member) => ({
          handle: String(member.handle),
          displayName: isString(member.displayName) ? member.displayName : member.handle,
          tokenHash: String(member.tokenHash),
          ...(isString(member.role) ? { role: member.role } : {}),
        }))
    : [];
  const invites = Array.isArray(input.invites)
    ? input.invites
        .filter((invite) => invite && isString(invite.code))
        .map((invite) => ({
          code: String(invite.code),
          ...(isString(invite.roomId) ? { roomId: invite.roomId } : {}),
          ...(Number.isFinite(invite.expiresAt) ? { expiresAt: invite.expiresAt } : {}),
          ...(invite.revoked === true ? { revoked: true } : {}),
        }))
    : [];
  const protectedRooms = Array.isArray(input.protectedRooms)
    ? input.protectedRooms.filter(isString).map(String)
    : [];
  return { members, invites, protectedRooms };
};

export const loadRegistry = (path) => {
  if (!path) {
    return emptyRegistry();
  }
  try {
    return normalizeRegistry(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    // A missing or corrupt registry means "no members and every room public" —
    // which is the safe direction: it cannot accidentally protect a room by
    // failing, and it cannot accidentally admit a member either.
    return emptyRegistry();
  }
};

export const isRoomProtected = (registry, roomId) =>
  registry.protectedRooms.includes(roomId);

/** The member a handle names, or `null`. A handle is how a live session is revoked. */
export const findMemberByHandle = (registry, handle) =>
  isString(handle)
    ? registry.members.find((member) => member.handle === handle) ?? null
    : null;

export const findMemberByToken = (registry, token) => {
  if (!isString(token)) {
    return null;
  }
  const candidate = hashToken(token);
  // Every member is compared so the *position* of a match does not leak either.
  let found = null;
  for (const member of registry.members) {
    if (safeEqual(member.tokenHash, candidate)) {
      found = member;
    }
  }
  return found;
};

export const findInvite = (registry, code, now = Date.now()) => {
  if (!isString(code)) {
    return { ok: false, reason: "no invite given" };
  }
  const invite = registry.invites.find((entry) => entry.code === code);
  if (!invite) {
    return { ok: false, reason: "unknown invite" };
  }
  if (invite.revoked) {
    return { ok: false, reason: "the invite was revoked" };
  }
  if (Number.isFinite(invite.expiresAt) && invite.expiresAt < now) {
    return { ok: false, reason: "the invite expired" };
  }
  return { ok: true, invite };
};

/**
 * The single decision. Returns `{ok:true, member}` or `{ok:false, reason}`.
 *
 * A **public** room needs nothing. A **protected** room needs either a valid
 * member token or a valid invite — and an invite scoped to one room is refused
 * for another.
 */
export const authorize = (
  registry,
  { roomId, token, invite } = {},
  now = Date.now(),
) => {
  if (!isString(roomId)) {
    return { ok: false, reason: "no room id" };
  }
  if (!isRoomProtected(registry, roomId)) {
    return { ok: true, member: null, via: "public" };
  }

  const member = findMemberByToken(registry, token);
  if (member) {
    return { ok: true, member, via: "token" };
  }

  const checked = findInvite(registry, invite, now);
  if (!checked.ok) {
    return {
      ok: false,
      reason: member === null && isString(token)
        ? `not authorized (${checked.reason})`
        : checked.reason,
    };
  }
  if (checked.invite.roomId && checked.invite.roomId !== roomId) {
    return { ok: false, reason: "the invite is for a different room" };
  }
  return { ok: true, member: null, via: "invite" };
};

/**
 * Append-only membership log. Records who, what and when — **never** a scene,
 * and never a token. A failed append is reported, not thrown: a logging failure
 * must not take a room down.
 */
export const logMembership = (path, entry) => {
  if (!path) {
    return true;
  }
  try {
    appendFileSync(
      path,
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    );
    return true;
  } catch {
    return false;
  }
};

/** Issues an invite. Returns the entry so a caller can print the code once. */
export const issueInvite = (registry, { roomId, ttlMs = DEFAULT_INVITE_TTL_MS, now = Date.now() } = {}) => {
  const invite = {
    code: newInviteCode(),
    ...(isString(roomId) ? { roomId } : {}),
    expiresAt: now + ttlMs,
  };
  registry.invites.push(invite);
  return invite;
};

export const revokeInvite = (registry, code) => {
  const invite = registry.invites.find((entry) => entry.code === code);
  if (!invite) {
    return false;
  }
  invite.revoked = true;
  return true;
};

export const readConfig = (env = process.env) => ({
  /** the registry file; absent means no members and every room public */
  registryPath: env.COLLAB_MEMBERS ?? "",
  /** the append-only membership log; absent means no logging */
  logPath: env.COLLAB_ACCESS_LOG ?? "",
  /** `on` refuses an unauthorized join; `off` admits everyone (the old behaviour) */
  enforcement: (env.COLLAB_ENFORCE_ACCESS ?? "on") !== "off",
});
