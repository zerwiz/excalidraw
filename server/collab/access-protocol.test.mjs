/**
 * Enforcement tests — real socket.io clients against a real server that has a
 * registry and a protected room. Nothing mocked.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { io as ioClient } from "socket.io-client";

import { writeFileSync as writeSync } from "node:fs";

import { hashToken, issueInvite, newToken } from "./access.mjs";
import { createCollabServer } from "./index.mjs";

const PUBLIC_ROOM = "room-public1";
const SECRET_ROOM = "room-secret1";

const dir = mkdtempSync(join(tmpdir(), "collab-enforce-"));
const membersPath = join(dir, "members.json");
const logPath = join(dir, "access.log");

const ANNA_TOKEN = newToken();
let inviteCode = "";

const registry = {
  members: [
    { handle: "anna", displayName: "Anna", tokenHash: hashToken(ANNA_TOKEN) },
  ],
  invites: [],
  protectedRooms: [SECRET_ROOM],
};
// Issue the invite through the module so the shape is the module's own.
inviteCode = issueInvite(registry, { roomId: SECRET_ROOM }).code;
writeFileSync(membersPath, JSON.stringify(registry));

let httpServer;
let url;
let clients = [];

const connect = () =>
  new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
    socket.once("init-room", () => resolve(socket));
    socket.once("connect_error", reject);
  });

const waitFor = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for '${event}'`)),
      timeoutMs,
    );
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });

const settled = (socket, event, timeoutMs = 1200) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ fired: false }), timeoutMs);
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve({ fired: true, args });
    });
  });

before(async () => {
  const created = createCollabServer({
    origins: ["http://localhost:7311"],
    accessConfig: { registryPath: membersPath, logPath, enforcement: true },
  });
  httpServer = created.httpServer;
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});

after(() => {
  for (const socket of clients) {
    socket.close();
  }
  clients = [];
  httpServer?.close();
});

describe("a public room", () => {
  it("admits a client that presents nothing at all", async () => {
    const socket = await connect();
    const roster = waitFor(socket, "room-user-change");
    socket.emit("join-room", PUBLIC_ROOM);
    const [members] = await roster;
    assert.deepEqual(members, [socket.id]);
  });
});

describe("a protected room", () => {
  it("REFUSES a client that presents nothing, and does not join it", async () => {
    const socket = await connect();
    const denied = settled(socket, "access-denied");
    let roster = false;
    socket.once("room-user-change", () => {
      roster = true;
    });

    socket.emit("join-room", SECRET_ROOM);
    const result = await denied;

    assert.equal(result.fired, true, "the client must be told why");
    assert.match(result.args[0].reason, /invite/);
    assert.equal(roster, false, "a refused client must not receive a roster");
  });

  it("REFUSES a wrong token", async () => {
    const socket = await connect();
    const denied = settled(socket, "access-denied");
    socket.emit("join-room", SECRET_ROOM, { token: "not-a-real-token" });
    const result = await denied;
    assert.equal(result.fired, true);
  });

  it("ADMITS a valid member token", async () => {
    const socket = await connect();
    const roster = waitFor(socket, "room-user-change");
    socket.emit("join-room", SECRET_ROOM, { token: ANNA_TOKEN });
    const [members] = await roster;
    assert.ok(members.includes(socket.id));
  });

  it("ADMITS a valid invite", async () => {
    const socket = await connect();
    const roster = waitFor(socket, "room-user-change");
    socket.emit("join-room", SECRET_ROOM, { invite: inviteCode });
    const [members] = await roster;
    assert.ok(members.includes(socket.id));
  });

  it("REFUSES an invite issued for a different room", async () => {
    const other = `${SECRET_ROOM.slice(0, -1)}9`; // a second protected room
    const path = membersPath;
    const withSecond = JSON.parse(readFileSync(path, "utf8"));
    withSecond.protectedRooms.push(other);
    writeFileSync(path, JSON.stringify(withSecond));

    const socket = await connect();
    const denied = settled(socket, "access-denied");
    socket.emit("join-room", other, { invite: inviteCode });
    const result = await denied;
    assert.equal(result.fired, true);
    assert.match(result.args[0].reason, /different room/);
  });
});

describe("the membership log", () => {
  it("recorded the joins and the refusals, and no token or invite value", () => {
    const contents = readFileSync(logPath, "utf8");
    assert.ok(contents.includes('"event":"joined"'));
    assert.ok(contents.includes('"event":"refused"'));
    assert.ok(!contents.includes(ANNA_TOKEN), "the log must never hold a token");
    assert.ok(!contents.includes(inviteCode), "nor an invite code");
  });
});

describe("with enforcement off", () => {
  it("admits everyone, which is the documented legacy behaviour", async () => {
    const created = createCollabServer({
      origins: ["http://localhost:7311"],
      accessConfig: { registryPath: membersPath, logPath, enforcement: false },
    });
    const server = created.httpServer;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const localUrl = `http://127.0.0.1:${server.address().port}`;
    const socket = ioClient(localUrl, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
    try {
      await new Promise((resolve) => socket.once("init-room", resolve));

      // A room of its own, so a socket left over from an earlier test cannot
      // appear in the roster and make this a moving assertion.
      const room = "room-open1";
      const roster = waitFor(socket, "room-user-change");
      socket.emit("join-room", room);
      const [members] = await roster;
      assert.deepEqual(members, [socket.id]);
    } finally {
      // Closed even when the assertion throws, or the open server holds the
      // event loop and the whole file times out.
      socket.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("revoking a LIVE session (feature-0013)", () => {
  it("drops a member's live sockets from a protected room, and tells the rest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "collab-revoke-"));
    const registryPath = join(dir, "members.json");
    const logPath = join(dir, "access.log");
    const token = newToken();
    const room = "room-revoke1";
    const writeRegistry = (members) =>
      writeSync(
        registryPath,
        JSON.stringify({ members, invites: [], protectedRooms: [room] }),
      );

    writeRegistry([
      { handle: "anna", displayName: "Anna", tokenHash: hashToken(token) },
      { handle: "bo", displayName: "Bo", tokenHash: hashToken(newToken()) },
    ]);

    const created = createCollabServer({
      origins: ["http://localhost:7311"],
      accessConfig: { registryPath, logPath, enforcement: true },
    });
    const server = created.httpServer;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const anna = ioClient(base, { transports: ["websocket"], forceNew: true, reconnection: false });
    const witness = ioClient(base, { transports: ["websocket"], forceNew: true, reconnection: false });
    clients.push(anna, witness);
    await Promise.all([
      new Promise((r) => anna.once("init-room", r)),
      new Promise((r) => witness.once("init-room", r)),
    ]);

    const annaRoster = waitFor(anna, "room-user-change");
    anna.emit("join-room", room, { token });
    await annaRoster;

    const witnessRoster = waitFor(witness, "room-user-change");
    witness.emit("join-room", room, { token });
    await witnessRoster;

    // Anna is revoked while she is INSIDE the room.
    const revokedEvent = waitFor(anna, "access-revoked", 5000);
    const rosterAfter = waitFor(witness, "room-user-change", 5000);
    writeRegistry([
      { handle: "bo", displayName: "Bo", tokenHash: hashToken(newToken()) },
    ]);

    const [revokedPayload] = await revokedEvent;
    assert.match(revokedPayload.reason, /revoked/);

    const [members] = await rosterAfter;
    assert.equal(members.includes(anna.id), false, "the revoked socket must be gone");
    assert.equal(members.includes(witness.id), true);

    // ...and a re-join is refused, with the same plain reason as before.
    const denied = await new Promise((resolve) => {
      anna.once("access-denied", (...args) => resolve(args));
      anna.emit("join-room", room, { token });
    });
    assert.match(denied[0].reason, /unknown invite|not authorized|revoked|invite/);

    created.stopWatching?.();
    server.close();
  });

  it("does NOT disconnect anyone when only an INVITE is revoked", async () => {
    const dir = mkdtempSync(join(tmpdir(), "collab-revoke2-"));
    const registryPath = join(dir, "members.json");
    const room = "room-revoke2";
    const invite = "invite-code-1";
    writeSync(
      registryPath,
      JSON.stringify({
        members: [],
        invites: [{ code: invite, roomId: room }],
        protectedRooms: [room],
      }),
    );

    const created = createCollabServer({
      origins: ["http://localhost:7311"],
      accessConfig: { registryPath, logPath: join(dir, "a.log"), enforcement: true },
    });
    const server = created.httpServer;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const guest = ioClient(base, { transports: ["websocket"], forceNew: true, reconnection: false });
    clients.push(guest);
    await new Promise((r) => guest.once("init-room", r));
    const roster = waitFor(guest, "room-user-change");
    guest.emit("join-room", room, { invite });
    await roster;

    let rogue = false;
    guest.once("access-revoked", () => {
      rogue = true;
    });

    // Revoke the invite while the guest is inside.
    writeSync(
      registryPath,
      JSON.stringify({
        members: [],
        invites: [{ code: invite, roomId: room, revoked: true }],
        protectedRooms: [room],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(rogue, false, "an invite is a door, not a leash");
    assert.equal(guest.connected, true);

    created.stopWatching?.();
    server.close();
  });
});
