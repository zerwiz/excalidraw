# feature-0016-uw-package-the-desktop-app

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the desktop app is an Electron shell that runs the **development** server (`desktop/start.sh` → Vite). It needs a terminal-free install, a real icon, and it depends on `node_modules` being present in a checkout. **Expected:** a distributable the operator installs the way they install anything else, which runs the **built** app rather than a dev server.

## Impact

**Affected:** adoption. A dev-server wrapper is fine for the person who built it and a wall for anyone else.

## Architecture intent

Build once, serve locally, wrap in Electron. The dev-server wrapper stays for development; the packaged app is a separate, testable artifact.

## Requirements

- A packaged build runs the production bundle from local files, with **no dev server and no network** required to open it.
- The window keeps the existing behaviour: native title, icon, external links to the system browser, and the app surviving a window close.
- A launcher entry is installed and a _Stop_ action exists, as it already does for the dev shell.
- The packaged app is built by a documented command, not by hand.

## Non-goals

Not an app store submission; not auto-update; not code signing in this ticket.

## Test cases

- **Positive:** the packaged app opens with no dev server running and no network.
- **Negative:** with the collaboration server unset, it opens and edits locally.
- **Compatibility:** the launcher's Start/Stop still work.

## Constraints

The Electron version and the GPU switches that keep it from segfaulting on Wayland + NVIDIA are kept, with the reason.

## Resolution

_(filled on close)_
