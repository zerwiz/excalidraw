import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  authorize,
  emptyRegistry,
  hashToken,
  isRoomProtected,
  issueInvite,
  loadRegistry,
  logMembership,
  newToken,
  normalizeRegistry,
  readConfig,
  revokeInvite,
  safeEqual,
} from "./access.mjs";

const registryWith = ({ members = [], invites = [], protectedRooms = [] } = {}) => ({
  members,
  invites,
  protectedRooms,
});

const member = (handle, token) => ({
  handle,
  displayName: handle,
  tokenHash: hashToken(token),
});

describe("safeEqual", () => {
  it("is true only for identical non-empty strings", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "ab"), false);
    assert.equal(safeEqual("", ""), false);
    assert.equal(safeEqual(undefined, "x"), false);
  });
});

describe("normalizeRegistry", () => {
  it("returns an empty registry for garbage", () => {
    assert.deepEqual(normalizeRegistry(null), emptyRegistry());
    assert.deepEqual(normalizeRegistry("nope"), emptyRegistry());
  });

  it("drops entries that cannot be salvaged", () => {
    const normalized = normalizeRegistry({
      members: [{ handle: "a", tokenHash: "h" }, { handle: "b" }, null, {}],
      invites: [{ code: "c" }, {}],
      protectedRooms: ["room-abc123", 42],
    });
    assert.equal(normalized.members.length, 1);
    assert.equal(normalized.invites.length, 1);
    assert.deepEqual(normalized.protectedRooms, ["room-abc123"]);
  });
});

describe("loadRegistry", () => {
  it("says 'no members, every room public' when the file is missing", () => {
    assert.deepEqual(loadRegistry("/nonexistent/registry.json"), emptyRegistry());
  });

  it("says the same for a corrupt file — it must not fail towards protecting OR admitting", () => {
    const dir = mkdtempSync(join(tmpdir(), "collab-access-"));
    const path = join(dir, "members.json");
    writeFileSync(path, "{ not json");
    assert.deepEqual(loadRegistry(path), emptyRegistry());
  });
});

describe("public vs protected rooms", () => {
  it("lets anyone into a room that is not listed as protected", () => {
    const decision = authorize(registryWith(), { roomId: "room-public1" });
    assert.equal(decision.ok, true);
    assert.equal(decision.via, "public");
  });

  it("refuses a protected room with no credentials at all", () => {
    const decision = authorize(
      registryWith({ protectedRooms: ["room-secret1"] }),
      { roomId: "room-secret1" },
    );
    assert.equal(decision.ok, false);
    assert.match(decision.reason, /invite/);
  });

  it("isRoomProtected is exact, not a prefix match", () => {
    const registry = registryWith({ protectedRooms: ["room-abc123"] });
    assert.equal(isRoomProtected(registry, "room-abc123"), true);
    assert.equal(isRoomProtected(registry, "room-abc124"), false);
  });
});

describe("member tokens", () => {
  const token = newToken();
  const registry = registryWith({
    members: [member("anna", token), member("bo", newToken())],
    protectedRooms: ["room-secret1"],
  });

  it("admits a valid token and names the member", () => {
    const decision = authorize(registry, { roomId: "room-secret1", token });
    assert.equal(decision.ok, true);
    assert.equal(decision.via, "token");
    assert.equal(decision.member.handle, "anna");
  });

  it("refuses a wrong token", () => {
    const decision = authorize(registry, { roomId: "room-secret1", token: "nope" });
    assert.equal(decision.ok, false);
  });

  it("refuses an empty token rather than treating it as absent-and-therefore-fine", () => {
    const decision = authorize(registry, { roomId: "room-secret1", token: "" });
    assert.equal(decision.ok, false);
  });

  it("never stores the token itself, only its hash", () => {
    const path = join(mkdtempSync(join(tmpdir(), "collab-access-")), "members.json");
    writeFileSync(
      path,
      JSON.stringify(registryWith({ members: [member("anna", token)] })),
    );
    const raw = readFileSync(path, "utf8");
    assert.ok(!raw.includes(token), "the file must not contain the raw token");
    assert.ok(raw.includes(hashToken(token)), "it contains the hash — which is the point");
    // ...and the loader still finds the member by hash.
    const loaded = loadRegistry(path);
    assert.deepEqual(loaded.members[0].tokenHash, hashToken(token));
    assert.equal(loaded.members[0].handle, "anna");
  });
});

describe("invites", () => {
  it("admits a valid invite", () => {
    const registry = registryWith({ protectedRooms: ["room-secret1"] });
    const invite = issueInvite(registry, { roomId: "room-secret1" });
    const decision = authorize(registry, {
      roomId: "room-secret1",
      invite: invite.code,
    });
    assert.equal(decision.ok, true);
    assert.equal(decision.via, "invite");
  });

  it("refuses an invite scoped to a different room", () => {
    const registry = registryWith({ protectedRooms: ["room-secret1", "room-secret2"] });
    const invite = issueInvite(registry, { roomId: "room-secret1" });
    const decision = authorize(registry, {
      roomId: "room-secret2",
      invite: invite.code,
    });
    assert.equal(decision.ok, false);
    assert.match(decision.reason, /different room/);
  });

  it("admits an unscoped invite to any protected room", () => {
    const registry = registryWith({ protectedRooms: ["room-secret1"] });
    const invite = issueInvite(registry, {});
    assert.equal(
      authorize(registry, { roomId: "room-secret1", invite: invite.code }).ok,
      true,
    );
  });

  it("refuses an expired invite", () => {
    const registry = registryWith({ protectedRooms: ["room-secret1"] });
    const invite = issueInvite(registry, { roomId: "room-secret1", ttlMs: 1000, now: 0 });
    const decision = authorize(
      registry,
      { roomId: "room-secret1", invite: invite.code },
      2000,
    );
    assert.equal(decision.ok, false);
    assert.match(decision.reason, /expired/);
  });

  it("refuses a revoked invite", () => {
    const registry = registryWith({ protectedRooms: ["room-secret1"] });
    const invite = issueInvite(registry, { roomId: "room-secret1" });
    assert.equal(revokeInvite(registry, invite.code), true);
    const decision = authorize(registry, {
      roomId: "room-secret1",
      invite: invite.code,
    });
    assert.equal(decision.ok, false);
    assert.match(decision.reason, /revoked/);
  });

  it("refuses an unknown invite", () => {
    const registry = registryWith({ protectedRooms: ["room-secret1"] });
    const decision = authorize(registry, {
      roomId: "room-secret1",
      invite: "made-up",
    });
    assert.equal(decision.ok, false);
    assert.match(decision.reason, /unknown invite/);
  });

  it("revoking an unknown code is false, not a throw", () => {
    assert.equal(revokeInvite(emptyRegistry(), "nope"), false);
  });
});

describe("the membership log", () => {
  it("appends, never rewrites, and carries no scene content", () => {
    const path = join(mkdtempSync(join(tmpdir(), "collab-access-")), "access.log");
    assert.equal(logMembership(path, { event: "joined", roomId: "room-abc123" }), true);
    assert.equal(logMembership(path, { event: "refused", roomId: "room-abc123" }), true);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).event, "joined");
    assert.equal(JSON.parse(lines[1]).event, "refused");
    assert.ok(lines[0].includes("at"), "each entry is dated");
  });

  it("reports a failure instead of throwing, so a logging fault cannot take a room down", () => {
    assert.equal(logMembership("/nonexistent-dir/access.log", { event: "joined" }), false);
    assert.equal(logMembership("", { event: "joined" }), true);
  });
});

describe("readConfig", () => {
  it("enforces by default and can be turned off explicitly", () => {
    assert.equal(readConfig({}).enforcement, true);
    assert.equal(readConfig({ COLLAB_ENFORCE_ACCESS: "off" }).enforcement, false);
  });

  it("defaults to no registry and no log", () => {
    const config = readConfig({});
    assert.equal(config.registryPath, "");
    assert.equal(config.logPath, "");
  });
});
