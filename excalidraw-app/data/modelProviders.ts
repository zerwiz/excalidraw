/**
 * Model and agent providers — the shapes the Settings surface speaks.
 *
 * Researched endpoint shapes live in `docs/research/model-providers.md`. This
 * module is pure logic plus injected `fetch`, so it is testable without a
 * browser and without a network.
 *
 * The rule that governs every function here: a provider talks only to the host
 * the operator configured. There is no default host anywhere in this file.
 */

/** The request shape a provider speaks. */
export type ProviderShape = "chat" | "responses" | "messages";

export type ProviderKind =
  | "llama.cpp"
  | "openai-compatible"
  | "openai-responses"
  | "anthropic"
  | "opencode-zen";

export type ModelProvider = {
  id: string;
  kind: ProviderKind;
  /** display name the operator chose */
  name: string;
  /** base URL as entered; always stored without a trailing slash */
  baseURL: string;
  /** write-only: never rendered back after saving */
  apiKey?: string;
  /** the model id selected from discovery (or typed) */
  model?: string;
  /**
   * Which path to call. Derived from `kind` unless the kind is a multi-shape
   * gateway (`opencode-zen`), where the catalogue decides and the choice is
   * stored per entry — the ticket requires this to live with the model, not the
   * provider.
   */
  shape?: ProviderShape;
};

export type AgentEndpoint = {
  id: string;
  name: string;
  baseURL: string;
};

export type ProviderKindMeta = {
  label: string;
  description: string;
  /** the shape used when the entry does not override it */
  defaultShape: ProviderShape;
  /** whether an API key is expected (not required — local servers take any) */
  keyExpected: boolean;
  /** whether `GET {base}/models` is expected to answer */
  discoverable: boolean;
  /** shown as the placeholder for a new entry */
  baseURLPlaceholder: string;
};

export const PROVIDER_KINDS: Record<ProviderKind, ProviderKindMeta> = {
  "llama.cpp": {
    label: "llama.cpp (local)",
    description:
      "A local llama-server or a router in front of several. OpenAI-compatible, no key required.",
    defaultShape: "chat",
    keyExpected: false,
    discoverable: true,
    baseURLPlaceholder: "http://localhost:8080/v1",
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    description:
      "Any host that speaks POST {base}/chat/completions and answers GET {base}/models.",
    defaultShape: "chat",
    keyExpected: true,
    discoverable: true,
    baseURLPlaceholder: "https://host/v1",
  },
  "openai-responses": {
    label: "OpenAI Responses API",
    description: "POST {base}/responses.",
    defaultShape: "responses",
    keyExpected: true,
    discoverable: false,
    baseURLPlaceholder: "https://host/v1",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    description:
      "POST {base}/messages with x-api-key and anthropic-version. max_tokens is required.",
    defaultShape: "messages",
    keyExpected: true,
    discoverable: true,
    baseURLPlaceholder: "https://api.anthropic.com/v1",
  },
  "opencode-zen": {
    label: "OpenCode Zen",
    description:
      "A gateway serving one model on several paths. The catalogue decides the shape per model.",
    defaultShape: "chat",
    keyExpected: true,
    discoverable: true,
    baseURLPlaceholder: "https://opencode.ai/zen/v1",
  },
};

export const ANTHROPIC_VERSION = "2023-06-01";

export const shapeFor = (provider: ModelProvider): ProviderShape =>
  provider.shape ?? PROVIDER_KINDS[provider.kind].defaultShape;

/** Strips trailing slashes so `${base}/models` is never doubled. */
export const normalizeBaseURL = (url: string): string =>
  url.trim().replace(/\/+$/, "");

export const modelsEndpoint = (provider: ModelProvider): string =>
  `${normalizeBaseURL(provider.baseURL)}/models`;

export const messagesEndpoint = (provider: ModelProvider): string =>
  `${normalizeBaseURL(provider.baseURL)}/messages`;

export const responsesEndpoint = (provider: ModelProvider): string =>
  `${normalizeBaseURL(provider.baseURL)}/responses`;

export const chatCompletionsEndpoint = (provider: ModelProvider): string =>
  `${normalizeBaseURL(provider.baseURL)}/chat/completions`;

/**
 * Headers for a provider. Anthropic wants `x-api-key` + a version header and
 * rejects `Authorization`; everything else uses a bearer token. A key is only
 * sent when one was stored — a local llama.cpp needs none.
 */
export const providerHeaders = (
  provider: ModelProvider,
): Record<string, string> => {
  if (shapeFor(provider) === "messages") {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
    };
    if (provider.apiKey) {
      headers["x-api-key"] = provider.apiKey;
    }
    return headers;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }
  return headers;
};

export type DiscoverResult = {
  ok: boolean;
  models: string[];
  /** the exact failure, for display — never swallowed */
  error?: string;
};

type FetchLike = typeof fetch;

const errorOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Extracts model ids from an OpenAI-shaped `{ data: [{ id }] }` payload. */
const parseModelIds = (payload: unknown): string[] => {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((entry) => (entry as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string");
};

/**
 * `GET {base}/models` — the discovery call. Returns the ids the host reports,
 * or the exact failure. Never throws: a failed discovery is a result, not an
 * exception, because the UI must show the reason.
 */
export const discoverModels = async (
  provider: ModelProvider,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<DiscoverResult> => {
  if (!provider.baseURL || normalizeBaseURL(provider.baseURL) === "") {
    return { ok: false, models: [], error: "No base URL configured." };
  }

  try {
    const response = await fetchImpl(modelsEndpoint(provider), {
      method: "GET",
      headers: providerHeaders(provider),
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: `GET /models returned ${response.status}${
          response.statusText ? ` ${response.statusText}` : ""
        }`,
      };
    }

    const payload = await response.json().catch(() => null);
    const models = parseModelIds(payload);
    if (!models.length) {
      return {
        ok: false,
        models: [],
        error: "The models endpoint answered, but reported no models.",
      };
    }
    return { ok: true, models };
  } catch (error) {
    return { ok: false, models: [], error: errorOf(error) };
  }
};

export type TestResult = {
  ok: boolean;
  /** a short line for the UI */
  detail: string;
  /** what discovery found, when it succeeded */
  models?: string[];
};

/**
 * Test connection — a real request, whose exact failure is reported. For a
 * discoverable kind that is `GET {base}/models`; for a non-discoverable one it
 * is a request to the endpoint the shape actually uses.
 */
export const testConnection = async (
  provider: ModelProvider,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<TestResult> => {
  const meta = PROVIDER_KINDS[provider.kind];

  if (meta.discoverable) {
    const result = await discoverModels(provider, fetchImpl, signal);
    if (!result.ok) {
      return { ok: false, detail: result.error ?? "Connection failed." };
    }
    return {
      ok: true,
      detail: `Connected — ${result.models.length} model${
        result.models.length === 1 ? "" : "s"
      } reported.`,
      models: result.models,
    };
  }

  // Not discoverable: reach for the endpoint the shape uses, without sending a
  // body that would spend tokens. A 4xx that is not 404 still proves reachability.
  const url =
    shapeFor(provider) === "responses"
      ? responsesEndpoint(provider)
      : chatCompletionsEndpoint(provider);

  try {
    const response = await fetchImpl(url, {
      method: "OPTIONS",
      headers: providerHeaders(provider),
      signal,
    });
    if (response.status === 404) {
      return {
        ok: false,
        detail: `${url} answered 404 — the base URL is probably wrong.`,
      };
    }
    return { ok: true, detail: `Reachable (${response.status}).` };
  } catch (error) {
    return { ok: false, detail: errorOf(error) };
  }
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type BuiltRequest = {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
};

/**
 * Builds the request for one provider + model. Kept separate from sending so a
 * future gateway (the team-vault design) can consume the same shape.
 */
export const buildChatRequest = (
  provider: ModelProvider,
  {
    messages,
    model,
    maxTokens = 4096,
    stream = true,
  }: {
    messages: ChatMessage[];
    model?: string;
    maxTokens?: number;
    stream?: boolean;
  },
): BuiltRequest => {
  const shape = shapeFor(provider);
  const resolvedModel = model ?? provider.model ?? "";
  const headers = providerHeaders(provider);

  if (shape === "messages") {
    const system = messages.filter((m) => m.role === "system");
    const rest = messages.filter((m) => m.role !== "system");
    return {
      url: messagesEndpoint(provider),
      init: {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: resolvedModel,
          max_tokens: maxTokens, // required by the Anthropic Messages API
          ...(system.length
            ? { system: system.map((m) => m.content).join("\n\n") }
            : {}),
          messages: rest.map(({ role, content }) => ({ role, content })),
          stream,
        }),
      },
    };
  }

  if (shape === "responses") {
    return {
      url: responsesEndpoint(provider),
      init: {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: resolvedModel,
          input: messages.map((m) => ({ role: m.role, content: m.content })),
          stream,
        }),
      },
    };
  }

  return {
    url: chatCompletionsEndpoint(provider),
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        stream,
      }),
    },
  };
};

export type AgentCardResult = {
  ok: boolean;
  detail: string;
  name?: string;
};

/**
 * Fetches an A2A agent card. An agent whose card will not load is not
 * connected, whatever its URL says.
 */
export const fetchAgentCard = async (
  agent: AgentEndpoint,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<AgentCardResult> => {
  if (!agent.baseURL) {
    return { ok: false, detail: "No base URL configured." };
  }
  const url = `${normalizeBaseURL(agent.baseURL)}/.well-known/agent-card.json`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        detail: `GET agent-card.json returned ${response.status}`,
      };
    }
    const card = (await response.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    if (!card || typeof card !== "object") {
      return { ok: false, detail: "The agent card is not valid JSON." };
    }
    return {
      ok: true,
      detail:
        typeof card.name === "string"
          ? `Connected to ${card.name}.`
          : "Connected.",
      name: typeof card.name === "string" ? card.name : undefined,
    };
  } catch (error) {
    return { ok: false, detail: errorOf(error) };
  }
};
