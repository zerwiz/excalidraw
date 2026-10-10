#!/usr/bin/env node
/**
 * Collaboration server — a self-hosted room server for this fork.
 *
 *   node server/collab/index.mjs
 *
 * Speaks the protocol the client already speaks (the events in
 * `excalidraw-app/app_constants.ts`), so no client change is needed:
 *
 *   client → server   join-room · server-broadcast · server-volatile-broadcast · user-follow
 *   server → client   init-room · first-in-room · new-user · room-user-change
 *                     client-broadcast · user-follow-room-change
 *
 * It relays **opaque encrypted bytes**. The room key lives in the URL fragment
 * and never reaches the server, so the server cannot read a whiteboard.
 *
 * Binds localhost by default.
 */

import { createServer } from "node:http";

import { Server } from "socket.io";

import {
  RoomStore,
  isPlausiblePayload,
  isPlausibleRoomId,
  readConfig,
} from "./rooms.mjs";

const config = readConfig();
const store = new RoomStore();

export const createCollabServer = ({ origins = config.allowedOrigins } = {}) => {
  const httpServer = createServer((req, res) => {
    if (req.url === "/healthz") {
      const payload = JSON.stringify({ ok: true, ...store.stats() });
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      });
      return res.end(payload);
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  const io = new Server(httpServer, {
    cors: { origin: origins, methods: ["GET", "POST"] },
    // The scene payload is encrypted bytes; a room is not a database, so a
    // generous but bounded frame is enough.
    maxHttpBufferSize: 16 * 1024 * 1024,
  });

  io.on("connection", (socket) => {
    // The client waits for this before sending join-room.
    socket.emit("init-room");

    /** rooms this socket is in — a socket should only be in one, but the
     *  protocol does not forbid more, so track them and clean up honestly. */
    const joined = new Set();

    socket.on("join-room", (roomId) => {
      if (!isPlausibleRoomId(roomId)) {
        return;
      }
      joined.add(roomId);
      socket.join(roomId);

      const { isFirst, members, scene } = store.join(roomId, socket.id);

      // Everyone needs the roster.
      io.to(roomId).emit("room-user-change", members);

      if (isFirst) {
        // The joiner owns initialization; the client fetches or seeds the scene.
        socket.emit("first-in-room");
        // If we hold the last encrypted scene, hand it over: the client has the
        // room key from the URL fragment, so it can read what we cannot.
        if (scene) {
          socket.emit("client-broadcast", scene.data, scene.iv);
        }
        return;
      }

      // Tell the others to send their scene to the newcomer.
      socket.to(roomId).emit("new-user", socket.id);
    });

    const relay = (volatile, roomId, data, iv) => {
      if (!isPlausibleRoomId(roomId) || !joined.has(roomId)) {
        return;
      }
      // Normalize whatever arrived into bytes without interpreting it.
      const payload =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data instanceof Uint8Array
            ? data
            : null;
      if (!payload || !isPlausiblePayload(payload)) {
        return;
      }
      const normalizedIv =
        iv instanceof Uint8Array ? iv : new Uint8Array(iv ?? []);

      if (!volatile) {
        // Persist the last non-volatile payload so a reconnecting client gets
        // the scene back. Volatile payloads (cursors) are never stored.
        store.rememberScene(roomId, payload, normalizedIv);
      }

      socket.to(roomId).emit("client-broadcast", payload, normalizedIv);
    };

    socket.on("server-broadcast", (roomId, data, iv) => {
      relay(false, roomId, data, iv);
    });

    socket.on("server-volatile-broadcast", (roomId, data, iv) => {
      relay(true, roomId, data, iv);
    });

    socket.on("user-follow", (roomId, followedBy) => {
      if (!isPlausibleRoomId(roomId) || !joined.has(roomId)) {
        return;
      }
      socket.to(roomId).emit("user-follow-room-change", followedBy);
    });

    const cleanup = () => {
      for (const roomId of joined) {
        const members = store.leave(roomId, socket.id);
        if (members) {
          io.to(roomId).emit("room-user-change", members);
        }
      }
      joined.clear();
    };

    socket.on("disconnect", cleanup);
  });

  return { io, httpServer, store };
};

// Only listen when run directly, so tests can start it on an ephemeral port.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { httpServer } = createCollabServer();
  httpServer.listen(config.port, config.host, () => {
    console.log(
      `Collab server on ws://${config.host}:${config.port} (protocol-compatible; relays encrypted bytes only)`,
    );
  });

  const sweeper = setInterval(() => {
    const dropped = store.sweep();
    if (dropped > 0) {
      console.log(JSON.stringify({ event: "sweep", dropped, ...store.stats() }));
    }
  }, 60_000);
  sweeper.unref?.();
}
