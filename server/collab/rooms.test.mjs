import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PAYLOAD_BYTES,
  RoomStore,
  isPlausiblePayload,
  isPlausibleRoomId,
  readConfig,
} from "./rooms.mjs";

describe("isPlausibleRoomId", () => {
  it("accepts a generated room id", () => {
    assert.ok(isPlausibleRoomId("aBc123_-xy"));
  });

  it("refuses short, long, and unsafe ids", () => {
    assert.equal(isPlausibleRoomId("abc"), false);
    assert.equal(isPlausibleRoomId("a".repeat(65)), false);
    assert.equal(isPlausibleRoomId("has/slash"), false);
    assert.equal(isPlausibleRoomId("has space"), false);
    assert.equal(isPlausibleRoomId(undefined), false);
  });
});

describe("isPlausiblePayload", () => {
  it("accepts a non-empty payload inside the bound", () => {
    assert.ok(isPlausiblePayload(new Uint8Array([1, 2, 3])));
  });

  it("refuses empty, oversized, and non-byte payloads", () => {
    assert.equal(isPlausiblePayload(new Uint8Array([])), false);
    assert.equal(isPlausiblePayload(new Uint8Array(MAX_PAYLOAD_BYTES + 1)), false);
    assert.equal(isPlausiblePayload("not bytes"), false);
  });
});

describe("RoomStore", () => {
  it("reports the first member, then the roster grows", () => {
    const store = new RoomStore();
    const first = store.join("room-abc123", "s1");
    assert.equal(first.isFirst, true);
    assert.deepEqual(first.members, ["s1"]);

    const second = store.join("room-abc123", "s2");
    assert.equal(second.isFirst, false);
    assert.deepEqual(second.members.sort(), ["s1", "s2"]);
  });

  it("reports the roster after a leave, and nothing for an unknown room", () => {
    const store = new RoomStore();
    store.join("room-abc123", "s1");
    store.join("room-abc123", "s2");
    assert.deepEqual(store.leave("room-abc123", "s2"), ["s1"]);
    assert.deepEqual(store.leave("room-abc123", "s1"), []);
    assert.equal(store.leave("nope-nope", "s1"), null);
  });

  it("stores the last scene and hands it back", () => {
    const store = new RoomStore();
    store.join("room-abc123", "s1");
    const data = new Uint8Array([1, 2, 3]);
    const iv = new Uint8Array([4, 5, 6]);
    assert.equal(store.rememberScene("room-abc123", data, iv), true);
    assert.deepEqual(store.getScene("room-abc123"), { data, iv });
  });

  it("refuses to store an oversized scene", () => {
    const store = new RoomStore();
    store.join("room-abc123", "s1");
    const huge = new Uint8Array(17 * 1024 * 1024);
    assert.equal(store.rememberScene("room-abc123", huge, new Uint8Array([1])), false);
    assert.equal(store.getScene("room-abc123"), null);
  });

  it("ignores a scene for a room it does not hold", () => {
    const store = new RoomStore();
    assert.equal(store.rememberScene("ghost-ghost", new Uint8Array([1]), new Uint8Array([1])), false);
  });

  it("keeps the scene when the last member leaves, so a reconnect gets it back", () => {
    const store = new RoomStore();
    store.join("room-abc123", "s1");
    store.rememberScene("room-abc123", new Uint8Array([9]), new Uint8Array([8]));
    store.leave("room-abc123", "s1");
    assert.notEqual(store.getScene("room-abc123"), null);
  });

  it("sweeps only rooms that have been empty past the TTL", () => {
    let clock = 1_000_000;
    const store = new RoomStore({ now: () => clock });
    store.join("room-abc123", "s1");
    store.rememberScene("room-abc123", new Uint8Array([1]), new Uint8Array([1]));
    store.leave("room-abc123", "s1");

    store.join("room-def456", "s2");
    store.leave("room-def456", "s2");

    clock += 60 * 60 * 1000; // an hour later
    const dropped = store.sweep();
    assert.equal(dropped, 2);
    assert.equal(store.stats().rooms, 0);
  });

  it("never sweeps a room that still has a member", () => {
    let clock = 1_000_000;
    const store = new RoomStore({ now: () => clock });
    store.join("room-abc123", "s1");
    clock += 60 * 60 * 1000;
    assert.equal(store.sweep(), 0);
    assert.equal(store.stats().rooms, 1);
    assert.equal(store.stats().members, 1);
  });
});

describe("readConfig", () => {
  it("binds localhost with a local-only origin list", () => {
    const config = readConfig({});
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 3002);
    assert.ok(
      config.allowedOrigins.every(
        (origin) => origin.includes("localhost") || origin.includes("127.0.0.1"),
      ),
    );
  });
});
