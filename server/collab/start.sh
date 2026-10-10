#!/usr/bin/env bash
# Start the collaboration server. It binds localhost by default.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/index.mjs"
