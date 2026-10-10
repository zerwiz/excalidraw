#!/usr/bin/env bash
# Start the Excalidraw DESKTOP app (Electron window over the local dev server).
# The browser is never opened.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/desktop/start.sh" "$@"
