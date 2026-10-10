/**
 * The room server's file store.
 *
 * Collaboration uploads an image **already encrypted** with the room key, so the
 * server stores opaque bytes and can read none of them — the same property as the
 * scene relay. That is the whole reason this can live on a server we do not fully
 * trust.
 *
 * `tickets/open/feature-0012-uw-remove-the-firebase-dependency.md`.
 */

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

/** One blob may not exceed this. An image, encrypted, is what this carries. */
export const MAX_BLOB_BYTES = 8 * 1024 * 1024;

/** A key is a room prefix plus an id — no scheme, no traversal, no surprises. */
export const isPlausibleKey = (key) =>
  typeof key === "string" &&
  key.length > 0 &&
  key.length <= 200 &&
  /^[A-Za-z0-9._/-]+$/.test(key) &&
  !key.includes("..") &&
  !key.startsWith("/");

/**
 * Resolves a key inside the store root, or `null` if it would escape.
 * Belt and braces with `isPlausibleKey`: the caller is not trusted to have used it.
 */
export const safePath = (root, key) => {
  if (!isPlausibleKey(key)) {
    return null;
  }
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, normalize(key));
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + sep)) {
    return null;
  }
  return target;
};

export const readConfig = (env = process.env) => ({
  /** where the blobs live; empty disables the store entirely */
  dir: env.COLLAB_FILES_DIR ?? "",
  maxBytes: Number(env.COLLAB_MAX_BLOB_BYTES ?? MAX_BLOB_BYTES),
});

/** Writes a blob. Returns a result rather than throwing, so routes answer plainly. */
export const saveBlob = async (
  root,
  key,
  bytes,
  { maxBytes = MAX_BLOB_BYTES } = {},
) => {
  if (!root) {
    return { ok: false, error: "no file store configured" };
  }
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, error: "empty body" };
  }
  if (bytes.byteLength > maxBytes) {
    return { ok: false, error: `blob exceeds ${maxBytes} bytes` };
  }
  const path = safePath(root, key);
  if (!path) {
    return { ok: false, error: "invalid key" };
  }
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return { ok: true, bytes: bytes.byteLength };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
};

/** Reads a blob, or `null`. */
export const readBlob = async (root, key) => {
  if (!root) {
    return null;
  }
  const path = safePath(root, key);
  if (!path) {
    return null;
  }
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return null;
    }
    return await readFile(path);
  } catch {
    return null;
  }
};

/** Removes a blob. Used by tests and by an operator tidying a dead room. */
export const removeBlob = async (root, key) => {
  const path = root ? safePath(root, key) : null;
  if (!path) {
    return false;
  }
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
};

/** `<root>/<key>` for a room's files — one place builds the path. */
export const roomFileKey = (roomId, fileId) =>
  `files/rooms/${roomId}/${fileId}`;

export const joinRoot = (...parts) => join(...parts);
