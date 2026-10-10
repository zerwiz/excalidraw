import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  migrateSettings,
  redactProvider,
  saveSettings,
} from "./settingsStore";

import type { Settings } from "./settingsStore";

beforeEach(() => {
  localStorage.clear();
});

describe("migrateSettings", () => {
  it("returns defaults for garbage", () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("fills missing collections rather than throwing", () => {
    const migrated = migrateSettings({ version: 1 });
    expect(migrated.models).toEqual([]);
    expect(migrated.agents).toEqual([]);
  });

  it("drops salvageless entries instead of crashing", () => {
    const migrated = migrateSettings({
      models: [
        { kind: "llama.cpp", baseURL: "http://h/v1" },
        { kind: "llama.cpp" }, // no baseURL
        null,
        {},
      ],
      agents: [{ baseURL: "" }, { name: "ok", baseURL: "http://h" }],
    });
    expect(migrated.models).toHaveLength(1);
    expect(migrated.agents).toHaveLength(1);
    expect(migrated.agents[0].name).toBe("ok");
  });

  it("normalises a stored base URL", () => {
    const migrated = migrateSettings({
      models: [{ kind: "llama.cpp", baseURL: "http://h:8080/v1///" }],
    });
    expect(migrated.models[0].baseURL).toBe("http://h:8080/v1");
  });

  it("keeps a stored key (it must round-trip or the provider stops working)", () => {
    const migrated = migrateSettings({
      models: [
        {
          kind: "anthropic",
          baseURL: "https://api.anthropic.com/v1",
          apiKey: "k",
        },
      ],
    });
    expect(migrated.models[0].apiKey).toBe("k");
  });

  it("gives an entry an id when one is missing", () => {
    const migrated = migrateSettings({
      models: [{ kind: "llama.cpp", baseURL: "http://h/v1" }],
    });
    expect(migrated.models[0].id).toBeTruthy();
  });

  it("normalises an optional collab server and ai backend", () => {
    const migrated = migrateSettings({
      collabServer: "http://localhost:3002/",
      aiBackend: "",
    });
    expect(migrated.collabServer).toBe("http://localhost:3002");
    expect(migrated.aiBackend).toBeUndefined();
  });
});

describe("redactProvider", () => {
  it("never exposes the key, and says one exists", () => {
    const redacted = redactProvider({
      id: "1",
      kind: "anthropic",
      name: "claude",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-secret",
    });
    expect(redacted).not.toHaveProperty("apiKey");
    expect(redacted.hasApiKey).toBe(true);
    expect(JSON.stringify(redacted)).not.toContain("sk-ant-secret");
  });
});

describe("load/save round trip", () => {
  it("starts empty, which means local-only", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists and reloads", () => {
    const settings: Settings = {
      version: 1,
      models: [
        {
          id: "1",
          kind: "llama.cpp",
          name: "local",
          baseURL: "http://localhost:8080/v1",
          model: "lfm",
        },
      ],
      agents: [{ id: "a", name: "scout", baseURL: "http://localhost:8301" }],
      collabServer: "http://localhost:3002",
    };
    saveSettings(settings);
    const loaded = loadSettings();
    expect(loaded.models).toHaveLength(1);
    expect(loaded.models[0].model).toBe("lfm");
    expect(loaded.agents[0].name).toBe("scout");
    expect(loaded.collabServer).toBe("http://localhost:3002");
  });

  it("survives a corrupt store by falling back to local-only", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, "{ not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
