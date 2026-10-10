# feature-0002-uw-settings-page-for-agents-and-local-models

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** there is no settings surface. Every endpoint the app talks to is compiled in from
env at build time — the AI backend (`excalidraw-app/components/AI.tsx`,
`VITE_APP_AI_BACKEND`), the collaboration server (`VITE_APP_WS_SERVER_URL`), the storage
backend. A user cannot connect a model at all: not a local llama.cpp, not Claude, not OpenCode
Zen, not an agent. Changing any of it is a rebuild.

**Expected:** a **Settings** view where a user connects the models and agents they already
have — a local llama.cpp server, Claude, OpenCode Zen, an OpenAI-compatible host, an A2A agent
— and can verify each one with a **Test connection** action before saving.

Endpoint shapes, auth headers and discovery rules are researched in
[`docs/research/model-providers.md`](../../docs/research/model-providers.md); this ticket
implements that table.

## Impact

**Affected:** every teammate. This is what turns a whiteboard into *the team's* tool: one
person runs a model on their machine, another has a Claude key, the team has a Zen workspace,
and each is connected without touching code.
**Risk if not built:** the tool stays single-operator, and every endpoint change is a developer
task.
**Urgency:** it is the seam feature-0001, feature-0003 and feature-0005 all land into.

## Architecture intent

Settings is the **single seam** through which all operator-configurable endpoints resolve. A
component asks the settings store for an endpoint; it never reads an env literal directly. That
is what makes "no unconfigured egress" enforceable rather than aspirational.

## Requirements

**Surfaces**

- A `Settings` view exists, reachable from the app menu, and renders under **both** the light
  and dark theme.
- It manages two lists: **models** and **agents**, plus the **collaboration server** URL.

**Models — the three shapes, honestly**

- A model entry is `{kind, name, baseURL, apiKey?, model?}` where `kind` is one of
  `llama.cpp` · `openai-compatible` · `openai-responses` · `anthropic` · `opencode-zen`.
- **Discovery.** For every kind whose host answers `GET {base}/models`, the UI calls it and
  offers the returned ids in a picker. A model id is never mandatory to type by hand. For
  `anthropic`, the id list is the documented Claude model list; the field accepts a free-text
  id as a fallback.
- **llama.cpp.** Base URL defaults to a local address; no API key is required; a key field, if
  filled, is sent as `Authorization: Bearer`. `GET {base}/models` populates the picker. A model
  that is not currently resident is still selectable — the first request loads it.
- **Claude.** `anthropic` kind: `POST {base}/messages`, `x-api-key` plus
  `anthropic-version: 2023-06-01`, `max_tokens` always sent, system prompt sent as the
  top-level `system` parameter. `openai-compatible` kind pointed at the Claude base URL is also
  allowed, and the UI states the limit: extended thinking is not returned through that door.
- **OpenCode Zen.** `opencode-zen` kind: base `https://opencode.ai/zen`, `Authorization: Bearer`.
  The catalogue from `GET /v1/models` decides, per model, which path is used —
  `/v1/chat/completions`, `/v1/responses` or `/v1/messages`. The selected shape is stored with
  the model entry, not once per provider.
- **Agents.** An agent entry is `{name, baseUrl}`. **Test connection** fetches
  `{baseUrl}/.well-known/agent-card.json`; an agent whose card does not parse is reported
  not-connected.

**Test connection**

- Every entry has a **Test connection** action that performs a real request and reports success,
  or the exact failure — status code or error string — inline.
- A URL that failed its last test is visibly marked, and no feature silently routes through it.

**Storage and honesty**

- Settings persist across restarts **locally only** (browser storage / IndexedDB). Nothing in
  the settings store is sent to any host that is not itself a configured endpoint.
- A credential field is write-only: after saving, the value is never rendered back in plain
  text, never written to an export, and never included in a shared scene.
- With no settings configured, the app behaves exactly as after feature-0001: local-only, and no
  request to an unconfigured host.
- The AI panel (`components/AI.tsx`) resolves its backend **from the settings store**; an env
  var, if present, seeds a default only. The panel names the configured model in its UI, so a
  user can see what is answering.

## Constraints

- No endpoint literal, project id or credential is added to the source tree. Defaults live in one
  module with one documented default per key (`RULES/08`).
- No setting is a hardcoded absolute path.
- The settings store is versioned and forward-migrating: an older stored shape loads without
  throwing, filling missing keys with defaults.
- Removing a setting returns the app to the local-only default, never to a hosted one.
- This ticket adds **no** network call of its own except operator-initiated discovery and Test
  connection — and an unconfigured app makes neither.
- Both themes, and the picker list must not depend on the network being up to render.

## Non-goals

- Not building the collaboration server (feature-0003) or the AI backend (feature-0005) — this
  provides the place their endpoints are configured.
- Not syncing settings between teammates or machines; not a shared team credential vault.
- Not a model marketplace, weight downloader, or provider billing surface.
- Not proxying model traffic through the app: the browser talks to the configured host directly,
  except where a self-hosted proxy is itself the configured entry.
- Not editing app preferences or scenes — connectivity settings only.

## Test cases

- **Positive — local:** run a llama.cpp server; add it as `llama.cpp`; **Test connection**
  succeeds and the picker lists the server's models; pick one, open the AI panel, send a
  prompt, and the network panel shows the request going to the configured host.
- **Positive — Claude:** add an `anthropic` entry; the request carries `x-api-key` and
  `anthropic-version`, and a `max_tokens` in the body; the reply renders in the AI panel.
- **Positive — Zen:** add an `opencode-zen` entry; the picker populates from
  `GET https://opencode.ai/zen/v1/models`; selecting a DeepSeek model sends the request to
  `/v1/chat/completions` and selecting a Claude model sends it to `/v1/messages`.
- **Negative:** an unreachable base URL → **Test connection** shows the exact error and the
  entry is marked not-connected; no feature routes through it.
- **Negative:** after saving an API key, reload Settings → the key is not rendered in plain
  text; an exported scene contains no key material.
- **Compatibility:** with an empty settings store, no request leaves the machine;
  `yarn test:typecheck` and `yarn test:app --watch=false` pass.

## Operations

**Rollout:** normal branch + PR; additive, behind the app menu.
**Observability:** each Test connection reports inline; the settings store is inspectable in
devtools during dev.
**Rollback:** revert the commit; stored settings are ignored, the app returns to env defaults,
and no scene data is affected.

## Resolution

*(filled on close)*
