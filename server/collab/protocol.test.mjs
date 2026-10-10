/**
 * Protocol tests — two REAL socket.io clients against a REAL server on an
 * ephemeral port. Nothing is mocked, so passing means the client's protocol
 * works, not that a double agrees with itself.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { io as ioClient } from "socket.io-client";

import { createCollabServer } from "./index.mjs";

let roomCounter = 0;
const uniqueRoom = (prefix = "room") => `${prefix}-${Date.now().toString(36)}${roomCounter++}`;

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

const join = async (socket, room) => {
  const rosterPromise = waitFor(socket, "room-user-change");
  socket.emit("join-room", room);
  return rosterPromise;
};

before(async () => {
  const created = createCollabServer({ origins: ["http://localhost:7311"] });
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

describe("the room protocol", () => {
  it("emits init-room on connect, before anything is asked of the client", async () => {
    // `connect()` only resolves on init-room, so reaching here is the assertion.
    const socket = await connect();
    assert.ok(socket.connected);
  });

  it("tells the first member the room is theirs to initialize", async () => {
    const room = uniqueRoom();
    const a = await connect();
    const firstInRoom = waitFor(a, "first-in-room");
    const roster = waitFor(a, "room-user-change");
    a.emit("join-room", room);
    await firstInRoom;
    const [members] = await roster;
    assert.deepEqual(members, [a.id]);
  });

  it("tells the others a new user arrived, and both see the roster", async () => {
    const room = uniqueRoom();
    const a = await connect();
    const b = await connect();

    await join(a, room);

    const newUser = waitFor(a, "new-user");
    const bRoster = waitFor(b, "room-user-change");
    b.emit("join-room", room);

    const [newUserId] = await newUser;
    assert.equal(newUserId, b.id);

    const [members] = await bRoster;
    assert.deepEqual(members.sort(), [a.id, b.id].sort());
  });

  it("relays an encrypted payload to the other members and nobody else", async () => {
    const a = await connect();
    const b = await connect();
    const c = await connect(); // a bystander in no room

    const room = uniqueRoom("room-relay");
    a.emit("join-room", room);
    b.emit("join-room", room);
    await waitFor(b, "room-user-change");
    c.emit("join-room", uniqueRoom("room-other"));
    await waitFor(c, "room-user-change");

    const payload = new Uint8Array([1, 2, 3, 4]);
    const iv = new Uint8Array([9, 9]);

    const received = waitFor(b, "client-broadcast");
    let bystanderSaw = false;
    c.once("client-broadcast", () => {
      bystanderSaw = true;
    });

    a.emit("server-broadcast", room, payload, iv);

    const [data, receivedIv] = await received;
    assert.deepEqual(new Uint8Array(data), payload);
    assert.deepEqual(new Uint8Array(receivedIv), iv);
    assert.equal(bystanderSaw, false, "a socket in another room must not receive it");
  });

  it("replays the stored scene to the first member of an emptied room", async () => {
    // The server only replays when the room is EMPTY. With a peer still present
    // the newcomer is served by that peer via `new-user`, which is the protocol
    // the client already implements — so this is the case the server must cover.
    const room = uniqueRoom("room-persist");
    const a = await connect();
    await join(a, room);

    a.emit("server-broadcast", room, new Uint8Array([7, 7, 7]), new Uint8Array([1]));
    await new Promise((resolve) => setTimeout(resolve, 150));

    // a leaves, so the room is empty but the scene is remembered.
    a.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const b = await connect();
    const replayed = waitFor(b, "client-broadcast");
    const firstInRoom = waitFor(b, "first-in-room");
    b.emit("join-room", room);
    await firstInRoom;

    const [data] = await replayed;
    assert.deepEqual(new Uint8Array(data), new Uint8Array([7, 7, 7]));
  });

  it("does NOT replay to a second member — that newcomer is served by its peer", async () => {
    const room = uniqueRoom("room-peer");
    const a = await connect();
    await join(a, room);
    a.emit("server-broadcast", room, new Uint8Array([7]), new Uint8Array([1]));
    await new Promise((resolve) => setTimeout(resolve, 150));

    const b = await connect();
    let replayed = false;
    b.once("client-broadcast", () => {
      replayed = true;
    });
    const newUser = waitFor(a, "new-user");
    b.emit("join-room", room);
    await newUser;
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(replayed, false);
  });

  it("does not persist a volatile payload", async () => {
    const room = uniqueRoom("room-volatile");
    const a = await connect();
    a.emit("join-room", room);
    await waitFor(a, "room-user-change");

    a.emit(
      "server-volatile-broadcast",
      room,
      new Uint8Array([5]),
      new Uint8Array([1]),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const b = await connect();
    let replayed = false;
    b.once("client-broadcast", () => {
      replayed = true;
    });
    b.emit("join-room", room);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(replayed, false, "a cursor must never be persisted as the scene");
  });

  it("relays user-follow as user-follow-room-change", async () => {
    const room = uniqueRoom("room-follow");
    const a = await connect();
    const b = await connect();
    a.emit("join-room", room);
    b.emit("join-room", room);
    await waitFor(b, "room-user-change");

    const followed = waitFor(b, "user-follow-room-change");
    a.emit("user-follow", room, [a.id]);
    const [followedBy] = await followed;
    assert.deepEqual(followedBy, [a.id]);
  });

  it("announces a departure to the remaining members", async () => {
    const room = uniqueRoom("room-leave");
    const a = await connect();
    const b = await connect();
    a.emit("join-room", room);
    b.emit("join-room", room);
    await waitFor(b, "room-user-change");

    const rosterAfter = waitFor(a, "room-user-change");
    b.close();
    const [members] = await rosterAfter;
    assert.deepEqual(members, [a.id]);
  });

  it("ignores a malformed room id instead of joining anything", async () => {
    const a = await connect();
    let heard = false;
    a.once("room-user-change", () => {
      heard = true;
    });
    a.emit("join-room", "no");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(heard, false);
  });

  it("answers /healthz with the live room count", async () => {
    const response = await fetch(`${url}/healthz`);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.rooms, "number");
    assert.equal(typeof body.members, "number");
  });
});
