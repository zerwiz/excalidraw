#!/usr/bin/env bash
# Start the Excalidraw DESKTOP app: Vite dev server + Electron window.
# Nothing is opened in a browser.
set -euo pipefail

PORT="${EXCALIDRAW_PORT:-7311}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
APP_DIR="$ROOT/excalidraw-app"
LOG="${XDG_CACHE_HOME:-$HOME/.cache}/excalidraw.log"
PIDFILE="${XDG_CACHE_HOME:-$HOME/.cache}/excalidraw.pid"

if [ ! -d "$APP_DIR" ]; then
  echo "App source not found at $APP_DIR" >&2
  exit 1
fi

if [ ! -x "$DIR/node_modules/.bin/electron" ]; then
  echo "Electron is not installed. Run:  (cd \"$DIR\" && npm install)" >&2
  exit 1
fi

# Reuse a dev server that is already answering on the port.
if curl -sf -o /dev/null "http://localhost:$PORT/"; then
  echo "Dev server already up on :$PORT"
else
  echo "Starting Excalidraw dev server on :$PORT ..."
  cd "$APP_DIR"
  # VITE_APP_OPEN=false keeps vite from spawning a browser window.
  VITE_APP_PORT="$PORT" VITE_APP_OPEN=false \
    nohup yarn start >"$LOG" 2>&1 &
  echo $! >"$PIDFILE"

  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "http://localhost:$PORT/" && break
    sleep 1
  done
fi

if ! curl -sf -o /dev/null "http://localhost:$PORT/"; then
  echo "Dev server failed to start on :$PORT — see $LOG" >&2
  exit 1
fi

# Launch the Electron window. exec keeps the process tree simple so that
# stop.sh can reap the wrapper and the server together.
cd "$DIR"
exec ./node_modules/.bin/electron . 2>>"$LOG"
