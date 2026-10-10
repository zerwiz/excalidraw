/**
 * TTD bridge — the translation layer between the Excalidraw AI panel and any
 * OpenAI-compatible model.
 *
 * The panel's client contract is unchanged: it POSTs the prompt and parses an
 * SSE stream of `{type:"content",delta}` … `{type:"done",finishReason}`.
 * This module converts an upstream OpenAI `chat.completions` stream into that
 * contract, so the model behind it can be local (llama.cpp), Claude, OpenCode
 * Zen, or anything else OpenAI-shaped.
 *
 * Deliberate: this file never logs or returns a prompt, and never returns an
 * upstream API key. See `tickets/open/feature-0005-uw-local-ai-text-to-diagram-backend.md`.
 */

/** The TTD event shapes the panel's `parseSSEStream` understands. */
export const ttdContent = (delta) => ({ type: "content", delta });

export const ttdDone = (finishReason = "stop") => ({
  type: "done",
  finishReason,
});

export const ttdError = (message, status) => ({
  type: "error",
  error: { message, ...(status === undefined ? {} : { status }) },
});

/** One SSE frame. The panel splits on blank lines and reads `data: ` lines. */
export const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

export const normalizeBaseURL = (url) => String(url ?? "").trim().replace(/\/+$/, "");

/**
 * The upstream request. `stream: true` is not optional — the panel renders
 * progressively and the bridge must not buffer the whole completion.
 */
export const buildUpstreamRequest = (
  { baseURL, model, apiKey },
  { messages, signal } = {},
) => {
  const url = `${normalizeBaseURL(baseURL)}/chat/completions`;
  const headers = { "content-type": "application/json" };
  // A local server needs no key; sending none keeps llama.cpp happy.
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, stream: true }),
      ...(signal ? { signal } : {}),
    },
  };
};

/**
 * Parses one upstream `data:` payload. Returns `null` for the terminal
 * `[DONE]` and for anything unparseable, so a malformed frame is skipped
 * rather than killing the stream.
 */
export const parseUpstreamChunk = (raw) => {
  const payload = String(raw).trim();
  if (payload === "" || payload === "[DONE]") {
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(payload);
  } catch {
    return null;
  }
  const choice = obj?.choices?.[0];
  const content = choice?.delta?.content;
  return {
    delta: typeof content === "string" ? content : "",
    finishReason: choice?.finish_reason ?? null,
    usage: obj?.usage ?? null,
  };
};

/** Maps an OpenAI finish_reason onto the panel's vocabulary. */
export const mapFinishReason = (reason) => {
  switch (reason) {
    case "length":
    case "content_filter":
    case "tool_calls":
    case "stop":
      return reason;
    default:
      return "stop";
  }
};

/**
 * Turns an upstream SSE byte stream into TTD SSE frames.
 *
 * Yields strings ready to write to the response. On upstream error it yields a
 * `ttdError` frame — the panel renders that instead of hanging.
 */
export async function* translateUpstream(response, { onUsage } = {}) {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    yield sse(
      ttdError(
        `Upstream returned ${response.status}${
          detail ? `: ${detail.slice(0, 300)}` : ""
        }`,
        response.status,
      ),
    );
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield sse(ttdError("Upstream returned no body."));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const chunk = parseUpstreamChunk(trimmed.slice(5));
        if (!chunk) {
          continue;
        }
        if (chunk.delta) {
          yield sse(ttdContent(chunk.delta));
        }
        if (chunk.usage && typeof onUsage === "function") {
          onUsage(chunk.usage);
        }
        if (chunk.finishReason) {
          yield sse(ttdDone(mapFinishReason(chunk.finishReason)));
          sawDone = true;
        }
      }
    }
  } catch (error) {
    yield sse(ttdError(error?.message ?? String(error)));
    return;
  } finally {
    reader.releaseLock?.();
  }

  // Some servers close without a finish_reason; the panel needs a terminal
  // event or it stays in a generating state.
  if (!sawDone) {
    yield sse(ttdDone("stop"));
  }
}

/**
 * Reads the bridge's configuration from the environment. Nothing is defaulted
 * to a hosted host: with no `TTD_MODEL_BASE_URL` the bridge refuses to start.
 */
export const readConfig = (env = process.env) => ({
  port: Number(env.TTD_BRIDGE_PORT ?? 4173),
  host: env.TTD_BRIDGE_HOST ?? "127.0.0.1",
  modelBaseURL: normalizeBaseURL(env.TTD_MODEL_BASE_URL),
  model: env.TTD_MODEL ?? "",
  modelApiKey: env.TTD_MODEL_API_KEY ?? "",
  /** comma-separated origins allowed to call the bridge */
  allowedOrigins: (env.TTD_BRIDGE_ORIGINS ?? "http://localhost:4172,http://127.0.0.1:4172")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});
