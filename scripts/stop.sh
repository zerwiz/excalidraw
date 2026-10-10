#!/usr/bin/env bash
# Stop the Excalidraw DESKTOP app (Electron window + its dev server).
# Scoped to this app — other vite/electron processes are left alone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/desktop/stop.sh" "$@"
