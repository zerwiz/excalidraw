# feature-0005-uw-local-ai-text-to-diagram-backend

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the AI panel (`excalidraw-app/components/AI.tsx`, `excalidraw-app/data/TTDStorage.ts`) posts to `VITE_APP_AI_BACKEND` — `https://oss-ai.excalidraw.com` in production (`.env.production:12`) — and expects Excalidraw's text-to-diagram streaming contract. A local model cannot answer it.

**Expected:** the AI panel works against a locally configured model, or against Claude or OpenCode Zen, chosen in Settings, using a backend the team runs.

## Impact

**Affected:** anyone using the AI panel; today it silently ships the prompt to Excalidraw's service and stops working offline. **Risk if not built:** the feature is unusable in the very setting the fork is for — private, local work. **Urgency:** it is the last inherited network surface after `feature-0001`.

## Architecture intent

Keep the **client contract** and replace the **server**, exactly as with collaboration: the `TTDStreamFetch` request and its SSE response shape stay, and a small self-hosted bridge translates them into an OpenAI-compatible call to the configured model.

## Requirements

- A bridge exists in-repo (`excalidraw-app/…` or `server/`) that accepts the AI panel's streaming request and returns the stream the panel already parses (`data: {"type":"content","delta":"…"}` … `data: {"type":"done","finishReason":"stop"}`).
- The bridge's upstream is a model entry from Settings (`feature-0002`): a local llama.cpp, Claude, or OpenCode Zen. It is not compiled in.
- With a local model configured and reachable, a text prompt produces a diagram in the panel, streamed, with no request to `*.excalidraw.com`.
- With no model configured, the AI panel does not attempt a request; it says no model is configured and offers to open Settings.
- Prompt content is not logged by the bridge; the bridge logs only timing and token counts.
- The bridge streams: the first content delta reaches the panel before the upstream generation completes, verified by a long prompt.

## Constraints

- The client-side request and SSE parsing contract is unchanged from the current panel.
- No credential in the repo; upstream keys come from Settings / environment.
- The bridge binds localhost by default.
- A slow or failed upstream produces an error event the panel renders, not a hung spinner.
- Prompt text is never written to a log file or a crash report.

## Non-goals

- Not improving diagram quality or changing prompt engineering.
- Not a general chat product — the panel remains text-to-diagram.
- Not multi-modal (images/vision) in this ticket.
- Not replacing the panel's UI beyond the "no model configured" state.

## Test cases

- **Positive:** configure a local model, send a prompt, receive a streamed diagram; the network panel shows only the local/self-hosted host.
- **Positive:** configure Claude via Settings, send the same prompt, receive a diagram.
- **Negative:** no model configured → panel states it and links to Settings; no request is made.
- **Negative:** upstream returns an error/timeout → the panel shows an error message, not a spinner that never resolves.
- **Compatibility:** existing TTD chat history in IndexedDB still lists and reopens.

## Operations

**Rollout:** ship the bridge with the app; the operator points it at a model. **Observability:** the bridge logs request timing and token counts, never prompt content. **Rollback:** point Settings at another model, or disable the panel; nothing is persisted server-side but chat history, which remains local.

## Resolution

_(filled on close)_

## Resolution

**Landed** on `feat/ttd-bridge` (2026-10-10).

### The bridge

`server/ttd-bridge/` — a Node service with **no dependencies**:

| File | What |
| --- | --- |
| `bridge.mjs` | the translation logic: frame builders, the upstream request, chunk parsing, finish-reason mapping, `translateUpstream`, `readConfig`. Pure + injected `fetch`, so it tests without a network. |
| `index.mjs` | the server: the panel route, a `diagram-to-code` route that answers an explicit error rather than pretending, `/healthz`, CORS, and a log line of timing and counts only. |
| `bridge.test.mjs` | 16 `node --test` cases. |
| `README.md`, `start.sh` | how to run it; `start.sh` refuses without a model. |

### Requirements, met

- **The client contract is unchanged.** The panel still POSTs and still parses `{type:"content",delta}` / `{type:"done",finishReason}`; the bridge converts an OpenAI `chat.completions` stream into exactly that.
- **The upstream is a configured model**, not a compiled-in host. `TTD_MODEL_BASE_URL` is required; with it unset the bridge **refuses to start** rather than picking a default.
- **No model configured → no request.** `AI.tsx` now renders the panel with an explicit _"No model configured"_ welcome screen and an **Open Settings** button, and `onTextSubmit` returns a `RequestError` — so a stray submit is refused, not sent anywhere.
- **Nothing logs a prompt.** The log line is `{event, ok, ms, firstDeltaMs, model, tokens, messages}`.
- **It streams.** `stream: true` is always sent and each delta is forwarded as it arrives.

### Verified

- **16 bridge tests** (`yarn test:server`): frame builders, request shape (streaming on, no `Authorization` without a key, bearer with one), chunk parsing including `[DONE]` and malformed frames, finish-reason mapping, full translation, the terminal-`done` guarantee when an upstream omits a finish reason, upstream-error reporting, and that usage goes to a callback rather than into the stream.
- **Full suite unchanged: 144 files, 2489 tests passed.** `server/**` is now excluded from vitest (`node:test` files cannot run under it) and covered by `yarn test:server` instead.
- `yarn test:typecheck` clean · `yarn build:app` built · eslint clean.
- **End to end against this machine's rail.** Bridge on `127.0.0.1:4173` → `127.0.0.1:8080/v1`:
  - `GET /healthz` → `{"ok":true,"model":"…","upstream":"http://127.0.0.1:8080/v1"}`.
  - A prompt streamed the **exact contract**, progressively: `data: {"type":"content","delta":"{\""}` … `data: {"type":"done","finishReason":"stop"}`.
  - With a model that fails to load, the panel got `data: {"type":"error",…"Upstream returned 500"}` — the error path proven rather than asserted.
  - The log line: `{"event":"ttd","ok":true,"ms":6699,"firstDeltaMs":6025,"model":"qwen3-coder-30b-a3b-3050@iq2_m","tokens":null,"messages":1}` — **no prompt text, no completion**.

### Not done, deliberately

- **`diagram-to-code` is not implemented.** It needs the vision path (an image in, code out). The route exists so the panel receives an explicit error instead of a hang; that work is a follow-up ticket.
- **No auto-start of the bridge.** The desktop shell does not launch it, because that would require a model choice the operator has not made yet. `server/ttd-bridge/start.sh` is the door.
- **No gateway.** As with feature-0002, policy/attribution/masking belong to the mediated gateway in the team-vault design; this bridge is the local translation layer.

---

## Appended 2026-10-10 — the ports moved (`chore-0002`)

Every port named above has been renumbered into the fork's own block, so the history reads correctly and the contract does not: **app `7311` · collab `7312` · bridge `7313` · board `7314`** (was `4172`/`3002`/`4173`/`4174`). The old numbers collided with Vite's own `preview` port and with every Node app's `3000`-range. This note is appended rather than edited into the text above, so the change is visible instead of silently tidied.
