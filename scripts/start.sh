#!/usr/bin/env bash
# Start the Excalidraw dev server (yarn start → vite on :5000)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "🚀 Starting Excalidraw dev server..."
yarn start
