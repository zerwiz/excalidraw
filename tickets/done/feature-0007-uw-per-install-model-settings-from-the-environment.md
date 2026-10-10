# feature-0007-uw-per-install-model-settings-from-the-environment

**Type** feature · **Status** done · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** Settings started **empty on every machine**. Two installs could not point at two different rails without editing code, and the only way to configure a fresh install was to retype every endpoint by hand. **Expected:** a fresh install **starts configured** from its own environment, and a stored configuration always wins afterwards.

## Impact

**Affected:** every install of the fork. Without this, "self-hosted" meant "hand-configured once per machine and then lost in a browser profile".

## Architecture intent

The environment **seeds**; the store **owns**. No component reads an endpoint literal directly — they all go through the settings seam, and the seam's defaults come from env.

## Requirements

- A fresh install seeds `models`, `collabServer`, `aiBackend`, `ticketsApi` and `publicUrl` from `VITE_APP_MODEL_BASE_URL`, `VITE_APP_MODEL`, `VITE_APP_COLLAB_SERVER`, `VITE_APP_AI_BACKEND`, `VITE_APP_TICKETS_API`, `VITE_APP_PUBLIC_URL`.
- Once anything is stored, **the environment is never consulted again** — `migrateSettings` must not re-seed, or an operator who deliberately clears a field would watch it come back.
- An unset variable means "not configured" — never a hosted default.
- The tracked `.env.development` carries documented, localhost-only defaults; a real hostname lives in the untracked `.env.local`.

## Non-goals

Not a team-shared settings vault; not settings sync between machines; not a config file inside the app.

## Test cases

- **Positive:** with `VITE_APP_MODEL_BASE_URL` set and no stored settings, Settings opens with that provider and an empty model id.
- **Negative:** with a stored configuration that has an emptied field, reloading does **not** repopulate it from the environment.
- **Compatibility:** `migrateSettings` still tolerates garbage and half-written shapes.

## Constraints

No endpoint literal in the source tree; one documented default per key.

## Resolution

**Landed** (commit `e186b390`). `envDefaults()` + `initialSettings()`; `loadSettings` seeds only when nothing is stored; `migrateSettings` never seeds. `.env.development` documents the keys and ships localhost-only; `.env.local` (gitignored) carries this install's real values.
