#!/usr/bin/env bash
# Start the collaboration server. It binds localhost by default.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

# Per-install configuration, if present. The environment always wins over it.
if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DIR/.env"
  set +a
fi
exec node "$DIR/index.mjs"
