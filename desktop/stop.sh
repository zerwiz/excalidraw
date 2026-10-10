#!/usr/bin/env bash
# Stop the Excalidraw DESKTOP app: the Electron window and its dev server.
# Scoped to this wrapper — it never touches another project's vite/electron.
set -euo pipefail

PORT="${EXCALIDRAW_PORT:-4172}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="${XDG_CACHE_HOME:-$HOME/.cache}/excalidraw.pid"
STOPPED=0

# 1. Electron processes belonging to THIS wrapper only.
while read -r p; do
  [ -n "$p" ] || continue
  if kill "$p" 2>/dev/null; then
    echo "killed electron $p"
    STOPPED=1
  fi
done < <(pgrep -f "$DIR/node_modules/electron" 2>/dev/null || true)

# 2. The dev server recorded in the pidfile.
if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    if kill "$PID" 2>/dev/null; then
      echo "killed dev server $PID"
      STOPPED=1
    fi
  fi
  rm -f "$PIDFILE"
fi

# 3. Anything still holding the port.
if command -v lsof >/dev/null 2>&1; then
  while read -r p; do
    [ -n "$p" ] || continue
    if kill "$p" 2>/dev/null; then
      echo "killed port holder $p"
      STOPPED=1
    fi
  done < <(lsof -ti ":$PORT" -sTCP:LISTEN 2>/dev/null || true)
fi

sleep 1
if [ "$STOPPED" = 1 ]; then
  echo "Excalidraw desktop stopped."
else
  echo "Excalidraw desktop is not running."
fi
