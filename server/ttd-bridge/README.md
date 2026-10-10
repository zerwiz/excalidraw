# TTD bridge — a self-hosted AI backend for the Excalidraw panel

The AI panel (text-to-diagram) speaks one contract: it POSTs a prompt and parses an SSE stream of `{type:"content",delta}` … `{type:"done",finishReason}`. This bridge accepts that request and forwards it to **any OpenAI-compatible model** — a local `llama-server`, Claude, OpenCode Zen — translating the answer back into the contract.

Nothing here calls a hosted default. With no `TTD_MODEL_BASE_URL` the bridge refuses to start.

```
panel ──POST /v1/ai/text-to-diagram/chat-streaming──▶ bridge ──▶ {model base}/chat/completions
      ◀── data: {"type":"content","delta":"…"} ───────┘      ◀── OpenAI SSE
```

## Run

```bash
TTD_MODEL_BASE_URL=http://127.0.0.1:8080/v1 \
TTD_MODEL=qwen3.6-35b-a3b@q4_k_xl \
node server/ttd-bridge/index.mjs
```

It binds `127.0.0.1:7313` by default. Then set **Settings → AI text-to-diagram backend** to `http://127.0.0.1:7313`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TTD_MODEL_BASE_URL` | _(none — required)_ | the OpenAI-compatible base, e.g. `http://127.0.0.1:8080/v1` |
| `TTD_MODEL` | _(none)_ | default model id; a request may override it |
| `TTD_MODEL_API_KEY` | _(none)_ | sent as `Authorization: Bearer`; local servers need none |
| `TTD_BRIDGE_PORT` | `4173` | the port this bridge listens on |
| `TTD_BRIDGE_HOST` | `127.0.0.1` | the interface it binds — localhost by default |
| `TTD_BRIDGE_ORIGINS` | `http://localhost:7311,http://127.0.0.1:7311` | comma-separated origins allowed by CORS |

## Routes

| Route | What |
| --- | --- |
| `GET /healthz` | `{ ok, model, upstream }` — a readiness probe |
| `POST /v1/ai/text-to-diagram/chat-streaming` | the panel's prompt; streams the TTD contract |
| `POST /v1/ai/diagram-to-code/generate-streaming` | not implemented — answers a single error frame rather than pretending |

## What it deliberately does not do

- **It never logs a prompt or a completion.** The log line carries timing (`ms`, `firstDeltaMs`), the model id, a message count, and token counts when the upstream reports them. Nothing else.
- **It never returns or logs a credential.** The upstream key stays in the bridge's environment and is only used to build the upstream headers.
- **It does not buffer.** `stream: true` is always sent and each upstream delta is forwarded as it arrives, so the first content frame reaches the panel before the generation finishes.
- **It does not invent a host.** No `TTD_MODEL_BASE_URL` means no server.

## Tests

```bash
node --test server/ttd-bridge
```

Covers the frame builders, the upstream request shape, chunk parsing (including `[DONE]` and malformed frames), finish-reason mapping, the full translation of an OpenAI stream, the terminal-`done` guarantee when an upstream omits a finish reason, upstream-error reporting, and that usage is surfaced through a callback rather than into the stream.

## Follow-up

`diagram-to-code` needs the vision path (an image in, code out) and is a separate ticket. The route exists so the panel gets an explicit answer instead of a hang.
