# Owners

Who owns which surface. The owner is named in every ticket header and requested automatically on every PR by `.github/CODEOWNERS` — the file says who, GitHub says "review requested".

## Dev ids

A ticket filename carries a dev id (`<type>-<NNNN>-<devid>-<slug>.md`). The table lives in [`../tickets/DEVIDS`](../tickets/DEVIDS) — add one line per teammate.

| Dev id | Handle  |
| ------ | ------- |
| `uw`   | @zerwiz |

## Surfaces

| Surface (paths)                                                   | Owner   |
| ----------------------------------------------------------------- | ------- |
| `excalidraw-app/` — the app shell, collaboration, AI panel, share | @zerwiz |
| `packages/` — the editor, element and math libraries              | @zerwiz |
| `desktop/` — the Electron shell                                   | @zerwiz |
| `tickets/`, `RULES/`, `docs/`                                     | @zerwiz |
| `bin/guards/`                                                     | @zerwiz |

When a teammate joins, add their dev id to `tickets/DEVIDS`, a row here, and a matching `CODEOWNERS` line.
