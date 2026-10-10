# Excalidraw desktop

An Electron shell around the local Excalidraw dev app. One window, no browser.

The wrapper runs the repo's Vite dev server (`excalidraw-app/`) on port `4172`, then opens it in an Electron window. The window has GPU acceleration disabled, because Electron 33 segfaults on Wayland + NVIDIA without it.

## Install (once)

```bash
npm install
```

## Use

From the repo root:

```bash
./scripts/start.sh   # dev server + Electron window
./scripts/stop.sh    # stop both
```

Or from this directory:

```bash
./start.sh
./stop.sh
```

## Environment

| Variable          | Default | Meaning                        |
| ----------------- | ------- | ------------------------------ |
| `EXCALIDRAW_PORT` | `4172`  | Port the dev server listens on |

## Notes

- Closing the window does **not** quit the app (by design). Run `./stop.sh`, or use the launcher's _Stop Excalidraw_ action.
- `stop.sh` only reaps this wrapper's Electron process and the dev server it started. It never kills another project's `vite` or `electron`.
- Electron's own log lands in `~/.config/excalidraw-desktop/debug.log`; the dev-server log lands in `~/.cache/excalidraw.log`.
