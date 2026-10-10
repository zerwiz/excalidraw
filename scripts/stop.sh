#!/usr/bin/env bash
# Stop all Excalidraw processes (dev server, http-server, etc.)
set -euo pipefail
echo "🛑 Stopping Excalidraw..."

# Kill vite dev server
pkill -f "vite" 2>/dev/null && echo "  Vite dev server stopped." || true

# Kill http-server (used by serve)
pkill -f "http-server" 2>/dev/null && echo "  http-server stopped." || true

echo "Done."
