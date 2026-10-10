/**
 * Room files — the room server's file store (self-hosted by design).
 *
 * Collaboration uploads an image **already encrypted** with the room key, so these
 * functions move opaque bytes and can read none of them. The server stores them at
 * `files/rooms/<roomId>/<fileId>` and hands them back to anyone holding the id —
 * the same capability model the hosted storage used, with the storage now ours.
 *
 * The SCENE needs nothing here: the room server already replays the last encrypted
 * scene to the first member of an emptied room (`feature-0003`), which is what the
 * Firestore half used to duplicate.
 *
 * `tickets/open/feature-0012-uw-remove-the-firebase-dependency.md`.
 */

import { MIME_TYPES } from "@excalidraw/common";

import type {
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import type { FileId } from "@excalidraw/element/types";

import { ENDPOINTS } from "../endpoints";
import { appJotaiStore } from "../app-jotai";

import { settingsAtom } from "./settingsState";

/** Where the room server is, resolved the same way the socket resolves it. */
const collabBaseURL = (): string | undefined =>
  appJotaiStore.get(settingsAtom)?.collabServer ?? ENDPOINTS.collabServer;

const fileURL = (prefix: string, id: string): string | undefined => {
  const base = collabBaseURL();
  if (!base) {
    return undefined;
  }
  const clean = prefix.replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/${clean}/${id}`;
};

export type SavedFiles = { savedFiles: FileId[]; erroredFiles: FileId[] };

/**
 * Uploads encrypted file blobs. With no room server configured this reports every
 * file as errored rather than silently succeeding — a save that did not happen
 * must not look like one that did.
 */
export const saveRoomFiles = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}): Promise<SavedFiles> => {
  const savedFiles: FileId[] = [];
  const erroredFiles: FileId[] = [];

  if (!collabBaseURL()) {
    return { savedFiles, erroredFiles: files.map(({ id }) => id) };
  }

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      const url = fileURL(prefix, id);
      if (!url) {
        erroredFiles.push(id);
        return;
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          body: buffer as unknown as BodyInit,
        });
        if (!response.ok) {
          erroredFiles.push(id);
          return;
        }
        savedFiles.push(id);
      } catch {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

/** Fetches and decrypts encrypted file blobs. */
export const loadRoomFiles = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
): Promise<{
  loadedFiles: BinaryFileData[];
  erroredFiles: Map<FileId, true>;
}> => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  if (!collabBaseURL()) {
    return { loadedFiles, erroredFiles };
  }

  // Imported lazily so this module never drags the encryption code into a bundle
  // that does not need it.
  const { decompressData } = await import("@excalidraw/excalidraw/data/encode");

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      const url = fileURL(prefix, id);
      if (!url) {
        erroredFiles.set(id, true);
        return;
      }
      try {
        const response = await fetch(url);
        if (!response.ok) {
          erroredFiles.set(id, true);
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const { data, metadata } = await decompressData<BinaryFileMetadata>(
          new Uint8Array(arrayBuffer),
          { decryptionKey },
        );

        // The decrypted bytes ARE the data URL, encoded — the same shape the
        // hosted path produced.
        const dataURL = new TextDecoder().decode(data) as DataURL;

        loadedFiles.push({
          mimeType: metadata.mimeType || MIME_TYPES.binary,
          id,
          dataURL,
          created: metadata?.created || Date.now(),
          lastRetrieved: metadata?.created || Date.now(),
        });
      } catch {
        erroredFiles.set(id, true);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};

export const hasRoomFileStore = () => Boolean(collabBaseURL());
