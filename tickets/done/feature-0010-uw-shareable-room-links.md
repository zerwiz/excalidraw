# feature-0010-uw-shareable-room-links

**Type** feature · **Status** done · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** a room link was built from `window.location.origin`, so on the operator's machine it read `http://localhost:7311/#room=…` — a link that **opens nothing for anybody else**, while looking perfectly correct to the person copying it. **Expected:** the link handed out carries the address the **team** reaches.

## Impact

**Affected:** the whole point of collaboration. A link nobody else can open is worse than no link, because it looks like it worked.

## Architecture intent

The address a link carries is a **per-install setting**, kept separate from the address the browser sits on. One room, two addresses.

## Requirements

- Room links resolve their base as: Settings `publicUrl` → `VITE_APP_PUBLIC_URL` → this browser.
- The **displayed and copied** active room link uses that base.
- The browser itself must **stay on its own origin**: `history.pushState` refuses a cross-origin URL, so navigation and sharing are separate builds of the same room link.
- Any form works — public hostname, tailnet name, internal name — and the Settings hint says so.
- Unset means "this machine", never somebody else's server.

## Non-goals

Not a URL shortener; not automatic discovery of the right hostname; not TLS.

## Test cases

- **Positive:** with `publicUrl` set, the active room link carries it and the browser URL does not.
- **Negative:** with it unset, the link is the local one and starting a session does not throw.
- **Compatibility:** joining a room by hash still works locally.

## Constraints

A real hostname never lands in the tracked tree; the public default stays empty.

## Resolution

**Landed.** `data/roomLink.ts` (`roomLinkBase`, `buildRoomLink`, `buildLocalRoomLink`), `settings.publicUrl` + `VITE_APP_PUBLIC_URL`, the Settings field, and `Collab` using the local link for `pushState` and the shareable one for the displayed link.

Found while doing it: pushing the shareable link into history threw `Uncaught (in promise)` ×6 — `pushState` refuses a cross-origin URL. That is why the two builds exist.
