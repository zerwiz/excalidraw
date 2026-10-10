# feature-0005-uw-local-ai-text-to-diagram-backend

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the AI panel (`excalidraw-app/components/AI.tsx`, `excalidraw-app/data/TTDStorage.ts`)
posts to `VITE_APP_AI_BACKEND` — `https://oss-ai.excalidraw.com` in production
(`.env.production:12`) — and expects Excalidraw's text-to-diagram streaming contract. A local
model cannot answer it.

**Expected:** the AI panel works against a locally configured model, or against Claude or
OpenCode Zen, chosen in Settings, using a backend the team runs.

## Impact

**Affected:** anyone using the AI panel; today it silently ships the prompt to Excalidraw's
service and stops working offline.
**Risk if not built:** the feature is unusable in the very setting the fork is for — private,
local work.
**Urgency:** it is the last inherited network surface after `feature-0001`.

## Architecture intent

Keep the **client contract** and replace the **server**, exactly as with collaboration: the
`TTDStreamFetch` request and its SSE response shape stay, and a small self-hosted bridge
translates them into an OpenAI-compatible call to the configured model.

## Requirements

- A bridge exists in-repo (`excalidraw-app/…` or `server/`) that accepts the AI panel's
  streaming request and returns the stream the panel already parses
  (`data: {"type":"content","delta":"…"}` … `data: {"type":"done","finishReason":"stop"}`).
- The bridge's upstream is a model entry from Settings (`feature-0002`): a local llama.cpp,
  Claude, or OpenCode Zen. It is not compiled in.
- With a local model configured and reachable, a text prompt produces a diagram in the panel,
  streamed, with no request to `*.excalidraw.com`.
- With no model configured, the AI panel does not attempt a request; it says no model is
  configured and offers to open Settings.
- Prompt content is not logged by the bridge; the bridge logs only timing and token counts.
- The bridge streams: the first content delta reaches the panel before the upstream generation
  completes, verified by a long prompt.

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

- **Positive:** configure a local model, send a prompt, receive a streamed diagram; the network
  panel shows only the local/self-hosted host.
- **Positive:** configure Claude via Settings, send the same prompt, receive a diagram.
- **Negative:** no model configured → panel states it and links to Settings; no request is made.
- **Negative:** upstream returns an error/timeout → the panel shows an error message, not a
  spinner that never resolves.
- **Compatibility:** existing TTD chat history in IndexedDB still lists and reopens.

## Operations

**Rollout:** ship the bridge with the app; the operator points it at a model.
**Observability:** the bridge logs request timing and token counts, never prompt content.
**Rollback:** point Settings at another model, or disable the panel; nothing is persisted
server-side but chat history, which remains local.

## Resolution

*(filled on close)*
