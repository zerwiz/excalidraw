import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";

import {
  MAX_BLOB_BYTES,
  isPlausibleKey,
  readBlob,
  readConfig,
  removeBlob,
  roomFileKey,
  safePath,
  saveBlob,
} from "./files.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "collab-files-"));
});
after(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("isPlausibleKey", () => {
  it("accepts a room file key", () => {
    assert.ok(isPlausibleKey("files/rooms/room-abc123/abcDEF123"));
  });

  it("refuses traversal, absolute paths, and junk", () => {
    assert.equal(isPlausibleKey("../etc/passwd"), false);
    assert.equal(isPlausibleKey("files/../../etc/passwd"), false);
    assert.equal(isPlausibleKey("/etc/passwd"), false);
    assert.equal(isPlausibleKey("has space"), false);
    assert.equal(isPlausibleKey(""), false);
    assert.equal(isPlausibleKey(undefined), false);
    assert.equal(isPlausibleKey("a".repeat(201)), false);
  });
});

describe("safePath", () => {
  it("resolves inside the root", () => {
    assert.equal(
      safePath(root, "files/rooms/r1/a"),
      join(root, "files/rooms/r1/a"),
    );
  });

  it("refuses to escape — belt and braces over isPlausibleKey", () => {
    assert.equal(safePath(root, "../escape"), null);
    assert.equal(safePath(root, "files/../../escape"), null);
    assert.equal(safePath(root, "/absolute"), null);
  });
});

describe("saveBlob / readBlob", () => {
  it("round-trips opaque bytes", async () => {
    const key = roomFileKey("room-abc123", "file1");
    const bytes = Buffer.from([1, 2, 3, 4, 255]);
    const saved = await saveBlob(root, key, bytes);
    assert.equal(saved.ok, true);
    assert.equal(saved.bytes, 5);
    assert.deepEqual(await readBlob(root, key), bytes);
  });

  it("refuses an empty body and an oversized one", async () => {
    assert.equal(
      (await saveBlob(root, "files/rooms/r/a", Buffer.alloc(0))).ok,
      false,
    );
    const huge = Buffer.alloc(MAX_BLOB_BYTES + 1);
    const refused = await saveBlob(root, "files/rooms/r/big", huge);
    assert.equal(refused.ok, false);
    assert.match(refused.error, /exceeds/);
  });

  it("honours a smaller configured bound", async () => {
    const refused = await saveBlob(root, "files/rooms/r/c", Buffer.alloc(10), {
      maxBytes: 4,
    });
    assert.equal(refused.ok, false);
  });

  it("refuses an invalid key rather than writing outside the root", async () => {
    const refused = await saveBlob(root, "../outside", Buffer.from([1]));
    assert.equal(refused.ok, false);
    assert.match(refused.error, /invalid key/);
  });

  it("says so plainly when no store is configured", async () => {
    const refused = await saveBlob("", "files/rooms/r/a", Buffer.from([1]));
    assert.equal(refused.ok, false);
    assert.match(refused.error, /no file store/);
    assert.equal(await readBlob("", "files/rooms/r/a"), null);
  });

  it("returns null for a missing blob instead of throwing", async () => {
    assert.equal(await readBlob(root, "files/rooms/r/nope"), null);
  });
});

describe("removeBlob", () => {
  it("removes what it stored, and reports a miss", async () => {
    const key = roomFileKey("room-abc123", "file2");
    await saveBlob(root, key, Buffer.from([9]));
    assert.equal(await removeBlob(root, key), true);
    assert.equal(await readBlob(root, key), null);
    assert.equal(await removeBlob(root, key), false);
  });
});

describe("roomFileKey", () => {
  it("builds one shape for a room's file", () => {
    assert.equal(
      roomFileKey("room-abc123", "f1"),
      "files/rooms/room-abc123/f1",
    );
  });
});

describe("readConfig", () => {
  it("is disabled with no directory, and bounded by default", () => {
    const config = readConfig({});
    assert.equal(config.dir, "");
    assert.equal(config.maxBytes, MAX_BLOB_BYTES);
  });
});
