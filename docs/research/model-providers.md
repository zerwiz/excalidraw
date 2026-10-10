# Model and agent providers — how to connect them

Reference for the Settings page (`tickets/open/feature-0002-uw-settings-page-for-agents-and-local-models.md`).
Every endpoint here is a **shape** the app must be able to speak, not a hardcoded default.
No credential, and no teammate's hostname, belongs in this file.

Sources are cited inline. Researched 2026-10-10.

---

## The three shapes

A provider is one of three request shapes. The Settings page stores the shape, not just a URL,
because the same base URL can serve more than one.

| Shape | Request | Typical hosts |
|---|---|---|
| **OpenAI chat completions** | `POST {base}/chat/completions` | llama.cpp, OpenCode Zen, Claude (compat) |
| **OpenAI responses** | `POST {base}/responses` | OpenCode Zen (GPT, Grok, Muse) |
| **Anthropic messages** | `POST {base}/messages` | Claude, OpenCode Zen (Claude, Qwen) |

Auth header follows the shape:

- OpenAI shapes — `Authorization: Bearer <key>`
- Anthropic messages — `x-api-key: <key>` and `anthropic-version: 2023-06-01`

---

## 1. Local models — llama.cpp

A local `llama-server` (or a multi-model router in front of several) serves an
**OpenAI-compatible** API under a base path ending in `/v1`.

| Property | Value |
|---|---|
| Base URL | `http://127.0.0.1:<port>/v1` (router) or the direct server port |
| Chat | `POST {base}/chat/completions` |
| Models list | `GET {base}/models` |
| Streaming | `stream: true`, server-sent events |
| API key | not required; llama.cpp accepts any non-empty value |
| Embeddings | `POST {base}/embeddings` on an embedding-mode instance |

**Discovery is the important part.** A user should not type model ids by hand: the Settings page
calls `GET {base}/models` and offers what the server reports. That is the difference between a
settings form and a usable one — the local rail on this machine exposes dozens of models across
swap groups, and hand-typing them is not a workflow.

A router may serve one model at a time and swap others in on request; a model id that is not
currently resident is still valid, because the first request loads it. The Settings page should
therefore treat the catalogue as the source of truth, not the currently-loaded model.

Relevant local facts (ports and shapes only — no hostnames):

- A router gateway typically fronts model ports and exposes a single OpenAI-compatible `/v1`.
- Models carry a quantisation suffix in their id (e.g. `@q4_k_s`); the id is opaque to us.
- An embedding model is a separate instance on its own port, serving `/v1/embeddings`, and is
  not a chat model.

---

## 2. OpenCode Zen ("opencode-go")

An AI gateway run by the OpenCode team. Authenticates with a single API key and exposes the
same models under several shapes.

| Property | Value |
|---|---|
| Base URL | `https://opencode.ai/zen` |
| Auth | `Authorization: Bearer $OPENCODE_API_KEY` |
| Models list | `GET https://opencode.ai/zen/v1/models` |
| OpenAI chat | `POST https://opencode.ai/zen/v1/chat/completions` (`@ai-sdk/openai-compatible`) |
| OpenAI responses | `POST https://opencode.ai/zen/v1/responses` (`@ai-sdk/openai`) |
| Anthropic messages | `POST https://opencode.ai/zen/v1/messages` (`@ai-sdk/anthropic`) |
| Config model id | `opencode/<model-id>` |

Which shape a model speaks is a property of the model, not the gateway — the same base URL
serves `/chat/completions`, `/responses` and `/messages` depending on the model. The Settings
page derives the shape from the catalogue entry.

DeepSeek, GLM, Kimi, MiniMax and Qwen-Max are served on the OpenAI-compatible shape; Claude,
Fable and Qwen-Plus models on the Anthropic shape; GPT, Grok and Muse on the responses shape.

**For teams** (relevant to the collaboration tickets): Zen supports workspace members with
**Admin** and **Member** roles, per-member monthly spending limits, per-model access controls so
an admin can disable a model for the workspace, and **bring-your-own-key** so an organisation's
own Anthropic or OpenAI key is billed by that provider instead of Zen.

Source: [Zen](https://opencode.ai/docs/zen/), [Providers](https://opencode.ai/docs/providers/).

---

## 3. Claude — Anthropic

Two doors; the Settings page should offer both, because the native door carries features the
compatibility door drops.

### Native (Anthropic Messages)

| Property | Value |
|---|---|
| Base URL | `https://api.anthropic.com` |
| Endpoint | `POST /v1/messages` |
| Auth | `x-api-key: <ANTHROPIC_API_KEY>` |
| Version header | `anthropic-version: 2023-06-01` |
| Content type | `application/json` |
| Gateway override | `ANTHROPIC_BASE_URL` |

`max_tokens` is **required**; the system prompt is a top-level `system` parameter, not a
message with `role: "system"`.

### OpenAI-compatible

Point an OpenAI-shaped client at the Claude API and keep the API key and model name:

| Property | Value |
|---|---|
| Base URL | `https://api.anthropic.com/v1/` |
| Endpoint | `POST /v1/chat/completions` |
| Auth | the Claude API key, as the OpenAI `apiKey` |
| Model ids | e.g. `claude-opus-5-5`, `claude-sonnet-4-6` |

**Limits of the compatibility door**, so the UI does not over-claim: extended thinking is not
returned through the OpenAI SDK (only through the native API), some OpenAI-only parameters are
ignored, and rate limits follow Anthropic's limits for `/v1/messages`. Where a model needs
thinking, the native shape is the honest choice.

Sources: [API overview](https://platform.claude.com/docs/en/api/overview),
[Messages](https://platform.claude.com/docs/en/api/http/messages),
[OpenAI SDK compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk),
[Using the Messages API](https://platform.claude.com/docs/en/build-with-claude/working-with-messages).

---

## 4. Agents (A2A)

An **agent** is not a model endpoint: it is a dispatchable worker. The project's A2A convention
publishes a card at `/.well-known/agent-card.json` and speaks JSON-RPC 2.0. The Settings page
stores an agent as `{name, baseUrl}` and offers the same **Test connection** action, which
fetches the agent card rather than calling `/v1/models`.

That fetch is also the honest test: an agent whose card will not load is not connected, whatever
its URL says.

---

## What the Settings page derives from this

```
provider[kind, baseURL, apiKey?, model?]
  "llama.cpp"           (local, OpenAI shape, discovery via GET /v1/models)     no key
  "openai-compatible"   (generic, OpenAI shape, discovery if the host answers)
  "openai-responses"    (OpenAI shape, /responses)
  "anthropic"           (native messages, x-api-key + anthropic-version)
  "opencode-zen"        (base https://opencode.ai/zen, bearer, catalogue decides the shape)
  "agent"               (A2A card, not a model)
```

Two rules fall out of the table above and belong in the ticket's Constraints:

1. **Discover before you ask.** Wherever the host answers `GET {base}/models`, the UI offers the
   list and never requires a hand-typed id.
2. **The shape follows the model.** For a multi-shape gateway, store the catalogue entry's shape
   with the model, not one shape for the whole provider.

## Secrets

A key is stored locally, write-only in the UI, never rendered back in plain text, never written
into an exported scene, and never committed. Nothing in this repository names a real key,
project id or teammate hostname.
