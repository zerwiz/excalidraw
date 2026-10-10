/**
 * Settings — the single seam through which every operator-configurable endpoint
 * resolves. A component asks this store; it never reads an env literal directly.
 *
 * Storage is **local only** (browser `localStorage`). Nothing here is sent to
 * any host that is not itself a configured endpoint.
 *
 * `feature-0002` — `tickets/open/feature-0002-uw-settings-page-for-agents-and-local-models.md`.
 */

import { normalizeBaseURL } from "./modelProviders";

import type { AgentEndpoint, ModelProvider } from "./modelProviders";

export const SETTINGS_STORAGE_KEY = "excalidraw-team-settings";
export const SETTINGS_VERSION = 1;

export type Settings = {
  version: number;
  models: ModelProvider[];
  agents: AgentEndpoint[];
  /**
   * The collaboration WebSocket server. When unset, collaboration is
   * unavailable rather than defaulting to a hosted service.
   */
  collabServer?: string;
  /**
   * The AI text-to-diagram backend (the bridge in feature-0005). When unset the
   * AI panel renders nothing rather than calling a hosted default.
   */
  aiBackend?: string;
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  models: [],
  agents: [],
};

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

/**
 * Coerces whatever was stored into the current shape. A shape written by an
 * older build must load without throwing, filling missing keys with defaults.
 * An entry that cannot be salvaged is dropped rather than crashing the app.
 */
export const migrateSettings = (input: unknown): Settings => {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const raw = input as Partial<Settings>;

  const models: ModelProvider[] = asArray<ModelProvider>(raw.models)
    .filter(
      (model) =>
        Boolean(model) && isString(model.baseURL) && isString(model.kind),
    )
    .map((model) => ({
      id: isString(model.id) ? model.id : createId(),
      kind: model.kind,
      name: isString(model.name) ? model.name : model.kind,
      baseURL: normalizeBaseURL(model.baseURL),
      // A key round-trips (it must, or the provider stops working) but is never
      // rendered back to the user.
      ...(isString(model.apiKey) ? { apiKey: model.apiKey } : {}),
      ...(isString(model.model) ? { model: model.model } : {}),
      ...(model.shape ? { shape: model.shape } : {}),
    }));

  const agents: AgentEndpoint[] = asArray<AgentEndpoint>(raw.agents)
    .filter((agent) => Boolean(agent) && isString(agent.baseURL))
    .map((agent) => ({
      id: isString(agent.id) ? agent.id : createId(),
      name: isString(agent.name) ? agent.name : "agent",
      baseURL: normalizeBaseURL(agent.baseURL),
    }));

  return {
    version: SETTINGS_VERSION,
    models,
    agents,
    ...(isString(raw.collabServer)
      ? { collabServer: normalizeBaseURL(raw.collabServer) }
      : {}),
    ...(isString(raw.aiBackend)
      ? { aiBackend: normalizeBaseURL(raw.aiBackend) }
      : {}),
  };
};

export const createId = (): string => {
  const bytes = new Uint8Array(6);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

export const loadSettings = (): Settings => {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    return migrateSettings(JSON.parse(raw));
  } catch (error) {
    // A corrupt store must not break the app: fall back to local-only.
    console.warn("Could not read stored settings; using defaults.", error);
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings: Settings): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...settings, version: SETTINGS_VERSION }),
    );
  } catch (error) {
    console.warn("Could not persist settings.", error);
  }
};

/** Whether anything at all has been configured. */
export const hasAnyEndpoint = (settings: Settings): boolean =>
  settings.models.length > 0 ||
  settings.agents.length > 0 ||
  Boolean(settings.collabServer) ||
  Boolean(settings.aiBackend);

/**
 * The public view of a model entry: the API key is **not** included. Use this
 * for anything that could be rendered or exported.
 */
export const redactProvider = (
  provider: ModelProvider,
): Omit<ModelProvider, "apiKey"> & { hasApiKey: boolean } => {
  const { apiKey, ...rest } = provider;
  return { ...rest, hasApiKey: Boolean(apiKey) };
};
