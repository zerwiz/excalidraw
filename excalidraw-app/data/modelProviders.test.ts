import { describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_VERSION,
  buildChatRequest,
  chatCompletionsEndpoint,
  discoverModels,
  fetchAgentCard,
  messagesEndpoint,
  normalizeBaseURL,
  providerHeaders,
  responsesEndpoint,
  testConnection,
} from "./modelProviders";

import type { AgentEndpoint, ModelProvider } from "./modelProviders";

const llama: ModelProvider = {
  id: "1",
  kind: "llama.cpp",
  name: "local",
  baseURL: "http://localhost:8080/v1",
};

const claude: ModelProvider = {
  id: "2",
  kind: "anthropic",
  name: "claude",
  baseURL: "https://api.anthropic.com/v1/",
  apiKey: "sk-ant-test",
};

const zen: ModelProvider = {
  id: "3",
  kind: "opencode-zen",
  name: "zen",
  baseURL: "https://opencode.ai/zen/v1",
  apiKey: "oc_test",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fetch double, so nothing leaves the process. */
const fetchStub = (impl: (url: string, init?: RequestInit) => Response) =>
  vi.fn(async (url: any, init?: RequestInit) => impl(String(url), init));

describe("normalizeBaseURL", () => {
  it("strips trailing slashes so endpoints are never doubled", () => {
    expect(normalizeBaseURL("http://h/v1/")).toBe("http://h/v1");
    expect(normalizeBaseURL("http://h/v1///")).toBe("http://h/v1");
    expect(normalizeBaseURL("  http://h/v1  ")).toBe("http://h/v1");
  });
});

describe("providerHeaders", () => {
  it("uses x-api-key + version for the Anthropic messages shape, never Authorization", () => {
    const headers = providerHeaders(claude);
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(headers.Authorization).toBeUndefined();
  });

  it("uses a bearer token when a key is stored", () => {
    expect(providerHeaders(zen).Authorization).toBe("Bearer oc_test");
  });

  it("sends no Authorization when no key is stored (a local server needs none)", () => {
    expect(providerHeaders(llama).Authorization).toBeUndefined();
  });
});

describe("endpoints", () => {
  it("builds each shape's URL without doubling the slash", () => {
    expect(messagesEndpoint(claude)).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(chatCompletionsEndpoint(llama)).toBe(
      "http://localhost:8080/v1/chat/completions",
    );
    expect(responsesEndpoint(zen)).toBe("https://opencode.ai/zen/v1/responses");
  });
});

describe("discoverModels", () => {
  it("returns the ids the host reports", async () => {
    const fetchImpl = fetchStub(() =>
      jsonResponse({ data: [{ id: "qwen3.6-35b@q4_k_s" }, { id: "lfm" }] }),
    );
    const result = await discoverModels(llama, fetchImpl as any);
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["qwen3.6-35b@q4_k_s", "lfm"]);
  });

  it("reports the exact status on failure rather than throwing", async () => {
    const fetchImpl = fetchStub(() => new Response("nope", { status: 401 }));
    const result = await discoverModels(zen, fetchImpl as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("refuses to call anything when there is no base URL", async () => {
    const fetchImpl = fetchStub(() => jsonResponse({ data: [] }));
    const result = await discoverModels(
      { ...llama, baseURL: "  " },
      fetchImpl as any,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no base url/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an empty catalogue as a failure, not a success", async () => {
    const fetchImpl = fetchStub(() => jsonResponse({ data: [] }));
    const result = await discoverModels(llama, fetchImpl as any);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no models/i);
  });

  it("surfaces a network error message", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    const result = await discoverModels(llama, fetchImpl as any);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Failed to fetch");
  });
});

describe("testConnection", () => {
  it("reports how many models a discoverable host reports", async () => {
    const fetchImpl = fetchStub(() => jsonResponse({ data: [{ id: "a" }] }));
    const result = await testConnection(llama, fetchImpl as any);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("1 model");
  });

  it("calls out a 404 on a non-discoverable provider as a wrong base URL", async () => {
    const provider: ModelProvider = {
      id: "4",
      kind: "openai-responses",
      name: "resp",
      baseURL: "https://h/v1",
    };
    const fetchImpl = fetchStub(() => new Response(null, { status: 404 }));
    const result = await testConnection(provider, fetchImpl as any);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/404/);
    expect(result.detail).toMatch(/base url/i);
  });

  it("treats any non-404 answer as reachable", async () => {
    const provider: ModelProvider = {
      id: "5",
      kind: "openai-responses",
      name: "resp",
      baseURL: "https://h/v1",
    };
    const fetchImpl = fetchStub(() => new Response(null, { status: 405 }));
    const result = await testConnection(provider, fetchImpl as any);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("405");
  });
});

describe("buildChatRequest", () => {
  it("sends max_tokens and a top-level system for the messages shape", () => {
    const built = buildChatRequest(claude, {
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
      maxTokens: 128,
    });
    const body = JSON.parse(built.init.body);
    expect(built.url).toBe("https://api.anthropic.com/v1/messages");
    expect(body.max_tokens).toBe(128);
    expect(body.system).toBe("be terse");
    // system must not also appear as a message — the API rejects that
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.messages.some((m: any) => m.role === "system")).toBe(false);
  });

  it("uses chat/completions for the chat shape", () => {
    const built = buildChatRequest(llama, {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(built.url).toBe("http://localhost:8080/v1/chat/completions");
    expect(JSON.parse(built.init.body).messages).toHaveLength(1);
  });

  it("uses /responses with an `input` for the responses shape", () => {
    const provider: ModelProvider = { ...zen, shape: "responses" };
    const built = buildChatRequest(provider, {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(built.url).toBe("https://opencode.ai/zen/v1/responses");
    expect(JSON.parse(built.init.body).input).toBeDefined();
  });

  it("lets the model override the stored one", () => {
    const built = buildChatRequest(
      { ...llama, model: "stored" },
      { messages: [], model: "explicit" },
    );
    expect(JSON.parse(built.init.body).model).toBe("explicit");
  });
});

describe("fetchAgentCard", () => {
  const agent: AgentEndpoint = {
    id: "a1",
    name: "scout",
    baseURL: "http://localhost:8301/",
  };

  it("reads the name from the card", async () => {
    const fetchImpl = fetchStub((url) => {
      expect(url).toBe("http://localhost:8301/.well-known/agent-card.json");
      return jsonResponse({ name: "well" });
    });
    const result = await fetchAgentCard(agent, fetchImpl as any);
    expect(result.ok).toBe(true);
    expect(result.name).toBe("well");
  });

  it("treats an unparseable card as not connected", async () => {
    const fetchImpl = fetchStub(
      () => new Response("not json", { status: 200 }),
    );
    const result = await fetchAgentCard(agent, fetchImpl as any);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/not valid json/i);
  });

  it("reports a 404 as a failure", async () => {
    const fetchImpl = fetchStub(() => new Response(null, { status: 404 }));
    const result = await fetchAgentCard(agent, fetchImpl as any);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("404");
  });
});
