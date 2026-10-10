/**
 * Room state for the collaboration server.
 *
 * The server **cannot read a room's content**. The room key lives in the URL
 * fragment, which the browser never sends, and every scene payload arrives
 * already encrypted. The server relays opaque bytes and stores the last one —
 * that is the whole design, and it is why a compromised server does not leak a
 * whiteboard.
 *
 * `tickets/open/feature-0003-uw-self-hosted-collaboration-server.md`.
 */

/** A room older than this with no members is dropped from memory. */
export const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;

/** The largest encrypted payload we accept, to bound a room's memory. */
export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

/** The largest stored scene we keep per room (the latest blob wins). */
export const MAX_STORED_SCENE_BYTES = 16 * 1024 * 1024;

export const isPlausibleRoomId = (roomId) =>
  typeof roomId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(roomId);

export const isPlausiblePayload = (payload) =>
  payload instanceof Uint8Array && payload.byteLength > 0
    ? payload.byteLength <= MAX_PAYLOAD_BYTES
    : false;

export class RoomStore {
  constructor({ now = () => Date.now() } = {}) {
    /** @type {Map<string, {members: Set<string>, scene: null | {data: Uint8Array, iv: Uint8Array}, updatedAt: number, createdAt: number}>} */
    this.rooms = new Map();
    this.now = now;
  }

  /**
   * Adds a socket to a room. Returns what the caller needs to answer:
   * whether this socket is the first member, and who is now in the room.
   */
  join(roomId, socketId) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        members: new Set(),
        scene: null,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      this.rooms.set(roomId, room);
    }
    const isFirst = room.members.size === 0;
    room.members.add(socketId);
    room.updatedAt = this.now();
    return { isFirst, members: this.memberIds(roomId), scene: room.scene };
  }

  /** Removes a socket. Returns the remaining members, or `null` if unknown. */
  leave(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }
    room.members.delete(socketId);
    room.updatedAt = this.now();
    if (room.members.size === 0) {
      // Keep the scene so a reconnecting client gets it back; the room itself
      // is only dropped by the sweeper.
      room.scene = room.scene;
      room.updatedAt = this.now();
    }
    return this.memberIds(roomId);
  }

  memberIds(roomId) {
    const room = this.rooms.get(roomId);
    return room ? [...room.members] : [];
  }

  /**
   * Stores the last scene payload. Only a `SCENE_INIT`/`SCENE_UPDATE` carries a
   * scene; a volatile payload (a cursor) is never persisted. The store does not
   * look inside — it cannot, the bytes are encrypted.
   */
  rememberScene(roomId, data, iv) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }
    if (data.byteLength > MAX_STORED_SCENE_BYTES) {
      return false;
    }
    room.scene = { data, iv };
    room.updatedAt = this.now();
    return true;
  }

  getScene(roomId) {
    return this.rooms.get(roomId)?.scene ?? null;
  }

  /** Drops rooms that have been empty for longer than the TTL. */
  sweep() {
    const cutoff = this.now() - EMPTY_ROOM_TTL_MS;
    let dropped = 0;
    for (const [roomId, room] of this.rooms) {
      if (room.members.size === 0 && room.updatedAt < cutoff) {
        this.rooms.delete(roomId);
        dropped += 1;
      }
    }
    return dropped;
  }

  stats() {
    let members = 0;
    for (const room of this.rooms.values()) {
      members += room.members.size;
    }
    return { rooms: this.rooms.size, members };
  }
}

export const readConfig = (env = process.env) => ({
  port: Number(env.COLLAB_PORT ?? 7312),
  host: env.COLLAB_HOST ?? "127.0.0.1",
  allowedOrigins: (
    env.COLLAB_ORIGINS ?? "http://localhost:7311,http://127.0.0.1:7311"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});
