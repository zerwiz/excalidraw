/**
 * The address a ROOM LINK carries.
 *
 * The collaboration *server* is one thing; the address the team is told to open
 * is another. On the operator's own machine those are the same (`localhost`), and
 * every link handed out is worthless to everybody else. So the link base is
 * **configurable per install** — point it at the host the team actually reaches
 * (`https://…`, a tailnet name, an internal name) and the room link becomes
 * shareable, while the operator keeps working locally.
 *
 * Resolution, in order:
 *   1. Settings → "Public app URL" (stored on this machine)
 *   2. `VITE_APP_PUBLIC_URL` (this install's env)
 *   3. whatever the browser is on — correct for a single-machine session
 *
 * Nothing here is a hosted default: an unset value means "this machine", which
 * is the honest answer and never sends anyone to somebody else's server.
 */

import { ENDPOINTS } from "../endpoints";
import { appJotaiStore } from "../app-jotai";

import { settingsAtom } from "./settingsState";

const trimTrailing = (value: string) => value.replace(/\/+$/, "");

/** The base a room link is built on — no trailing slash. */
export const roomLinkBase = (): string => {
  const configured =
    appJotaiStore.get(settingsAtom)?.publicUrl ?? ENDPOINTS.publicUrl;
  if (configured) {
    return trimTrailing(configured);
  }
  if (typeof window === "undefined") {
    return "";
  }
  const path =
    window.location.pathname === "/"
      ? ""
      : trimTrailing(window.location.pathname);
  return `${window.location.origin}${path}`;
};

export const buildRoomLink = (roomId: string, roomKey: string): string =>
  `${roomLinkBase()}#room=${roomId},${roomKey}`;

/**
 * The SAME room, addressed where this browser actually is.
 *
 * `history.pushState` refuses a cross-origin URL, and rightly so — so the browser
 * navigates locally while the link we HAND OUT is the shareable one. Two
 * addresses, one room.
 */
export const buildLocalRoomLink = (roomId: string, roomKey: string): string => {
  if (typeof window === "undefined") {
    return buildRoomLink(roomId, roomKey);
  }
  const path =
    window.location.pathname === "/"
      ? ""
      : trimTrailing(window.location.pathname);
  return `${window.location.origin}${path}#room=${roomId},${roomKey}`;
};

/** True when the link points somewhere other than where we are sitting. */
export const isShareableLink = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return !roomLinkBase().startsWith(window.location.origin);
};
