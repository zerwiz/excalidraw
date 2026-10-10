import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildUpstreamRequest,
  mapFinishReason,
  normalizeBaseURL,
  parseUpstreamChunk,
  readConfig,
  sse,
  translateUpstream,
  ttdContent,
  ttdDone,
  ttdError,
} from "./bridge.mjs";

/** Builds a `Response` whose body streams the given SSE text. */
const sseResponse = (frames, { ok = true, status = 200 } = {}) => {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(ok ? body : "bad", { status });
};

const collect = async (iterable) => {
  const out = [];
  for await (const item of iterable) {
    out.push(item);
  }
  return out;
};

const openAiFrame = (delta, finish = null) =>
  `data: ${JSON.stringify({
    choices: [{ delta: { content: delta }, finish_reason: finish }],
  })}\n\n`;

describe("sse frame builders", () => {
  it("emits the exact frames the panel parses", () => {
    assert.equal(sse(ttdContent("hi")), 'data: {"type":"content","delta":"hi"}\n\n');
    assert.equal(
      sse(ttdDone("stop")),
      'data: {"type":"done","finishReason":"stop"}\n\n',
    );
    const err = sse(ttdError("boom", 500));
    assert.match(err, /"type":"error"/);
    assert.match(err, /"status":500/);
  });

  it("omits status when none is given", () => {
    assert.equal(sse(ttdError("boom")), 'data: {"type":"error","error":{"message":"boom"}}\n\n');
  });
});

describe("normalizeBaseURL", () => {
  it("strips trailing slashes so the path is never doubled", () => {
    assert.equal(normalizeBaseURL("http://h/v1///"), "http://h/v1");
    assert.equal(normalizeBaseURL(undefined), "");
  });
});

describe("buildUpstreamRequest", () => {
  it("posts to /chat/completions with streaming on", () => {
    const { url, init } = buildUpstreamRequest(
      { baseURL: "http://localhost:8080/v1/", model: "m" },
      { messages: [{ role: "user", content: "hi" }] },
    );
    assert.equal(url, "http://localhost:8080/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.stream, true);
    assert.equal(body.model, "m");
    assert.equal(body.messages.length, 1);
  });

  it("sends no Authorization header when there is no key", () => {
    const { init } = buildUpstreamRequest({ baseURL: "http://h/v1", model: "m" });
    assert.equal(init.headers.Authorization, undefined);
  });

  it("sends a bearer token when one is configured", () => {
    const { init } = buildUpstreamRequest({
      baseURL: "http://h/v1",
      model: "m",
      apiKey: "k",
    });
    assert.equal(init.headers.Authorization, "Bearer k");
  });
});

describe("parseUpstreamChunk", () => {
  it("returns the delta", () => {
    assert.deepEqual(parseUpstreamChunk('{"choices":[{"delta":{"content":"hi"}}]}'), {
      delta: "hi",
      finishReason: null,
      usage: null,
    });
  });

  it("treats [DONE] and garbage as nothing to emit", () => {
    assert.equal(parseUpstreamChunk("[DONE]"), null);
    assert.equal(parseUpstreamChunk("{not json"), null);
    assert.equal(parseUpstreamChunk(""), null);
  });

  it("carries the finish reason and usage when present", () => {
    const parsed = parseUpstreamChunk(
      '{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":4}}',
    );
    assert.equal(parsed.finishReason, "stop");
    assert.equal(parsed.usage.prompt_tokens, 3);
  });
});

describe("mapFinishReason", () => {
  it("passes the known reasons through and defaults the rest to stop", () => {
    assert.equal(mapFinishReason("length"), "length");
    assert.equal(mapFinishReason("content_filter"), "content_filter");
    assert.equal(mapFinishReason(undefined), "stop");
    assert.equal(mapFinishReason("weird"), "stop");
  });
});

describe("translateUpstream", () => {
  it("converts an OpenAI stream into the panel's frames", async () => {
    const response = sseResponse([
      openAiFrame("Hel"),
      openAiFrame("lo"),
      openAiFrame("", "stop"),
    ]);
    const frames = await collect(translateUpstream(response));
    assert.deepEqual(frames, [
      sse(ttdContent("Hel")),
      sse(ttdContent("lo")),
      sse(ttdDone("stop")),
    ]);
  });

  it("emits a terminal done when the upstream never sends a finish_reason", async () => {
    const response = sseResponse([openAiFrame("only")]);
    const frames = await collect(translateUpstream(response));
    assert.equal(frames.at(-1), sse(ttdDone("stop")));
  });

  it("reports an upstream error as an error frame instead of hanging", async () => {
    const response = new Response("nope", { status: 503 });
    const frames = await collect(translateUpstream(response));
    assert.equal(frames.length, 1);
    assert.match(frames[0], /"type":"error"/);
    assert.match(frames[0], /503/);
  });

  it("surfaces usage through the callback, not into the stream", async () => {
    const seen = [];
    const response = sseResponse([
      openAiFrame("x"),
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      })}\n\n`,
    ]);
    const frames = await collect(
      translateUpstream(response, { onUsage: (usage) => seen.push(usage) }),
    );
    assert.deepEqual(seen, [{ prompt_tokens: 1, completion_tokens: 2 }]);
    assert.ok(!frames.some((frame) => frame.includes("prompt_tokens")));
  });
});

describe("readConfig", () => {
  it("defaults to localhost and refuses to invent a model host", () => {
    const config = readConfig({});
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 4173);
    assert.equal(config.modelBaseURL, "");
  });

  it("does not default the origin allow-list to a public host", () => {
    const config = readConfig({});
    assert.ok(config.allowedOrigins.every((origin) => origin.includes("localhost") || origin.includes("127.0.0.1")));
  });
});
