import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { TrashIcon } from "@excalidraw/excalidraw/components/icons";
import React, { useCallback, useMemo, useState } from "react";

import { useAtom } from "../app-jotai";

import {
  PROVIDER_KINDS,
  discoverModels,
  fetchAgentCard,
  testConnection,
} from "../data/modelProviders";
import { settingsDialogStateAtom, settingsAtom } from "../data/settingsState";
import { createId, redactProvider, saveSettings } from "../data/settingsStore";

import "./SettingsDialog.scss";

import type {
  AgentEndpoint,
  ModelProvider,
  ProviderKind,
  ProviderShape,
} from "../data/modelProviders";
import type { Settings } from "../data/settingsStore";

type TestState = { ok: boolean; detail: string } | null;

const PROVIDER_KIND_ORDER: ProviderKind[] = [
  "llama.cpp",
  "openai-compatible",
  "openai-responses",
  "anthropic",
  "opencode-zen",
];

const SHAPE_LABELS: Record<ProviderShape, string> = {
  chat: "chat/completions",
  responses: "responses",
  messages: "messages (Anthropic)",
};

const emptySettings = (): Settings => ({ version: 1, models: [], agents: [] });

/**
 * The Settings surface — one place to point the tool at the models and agents
 * the team already has. Nothing here contacts a host that is not configured.
 */
export const SettingsDialog = () => {
  const [, setDialogState] = useAtom(settingsDialogStateAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [discoveries, setDiscoveries] = useState<Record<string, string[]>>({});
  /**
   * Key drafts, held only until they are saved. A stored key is **never**
   * rendered back — the field starts empty every time the dialog opens.
   */
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  const current = settings ?? emptySettings();

  const update = useCallback(
    (next: Settings) => {
      saveSettings(next);
      setSettings(next);
    },
    [setSettings],
  );

  const setModel = useCallback(
    (id: string, patch: Partial<ModelProvider>) => {
      update({
        ...current,
        models: current.models.map((model) =>
          model.id === id ? { ...model, ...patch } : model,
        ),
      });
    },
    [current, update],
  );

  const setAgent = useCallback(
    (id: string, patch: Partial<AgentEndpoint>) => {
      update({
        ...current,
        agents: current.agents.map((agent) =>
          agent.id === id ? { ...agent, ...patch } : agent,
        ),
      });
    },
    [current, update],
  );

  const runModelTest = useCallback(async (model: ModelProvider) => {
    setTests((prev) => ({
      ...prev,
      [model.id]: { ok: false, detail: "Testing…" },
    }));
    const result = await testConnection(model);
    setTests((prev) => ({
      ...prev,
      [model.id]: { ok: result.ok, detail: result.detail },
    }));
    if (result.ok && result.models?.length) {
      setDiscoveries((prev) => ({ ...prev, [model.id]: result.models! }));
    }
  }, []);

  const runDiscovery = useCallback(async (model: ModelProvider) => {
    setTests((prev) => ({
      ...prev,
      [model.id]: { ok: false, detail: "Listing models…" },
    }));
    const result = await discoverModels(model);
    setTests((prev) => ({
      ...prev,
      [model.id]: {
        ok: result.ok,
        detail: result.ok
          ? `${result.models.length} model${
              result.models.length === 1 ? "" : "s"
            }.`
          : result.error ?? "Discovery failed.",
      },
    }));
    if (result.ok) {
      setDiscoveries((prev) => ({ ...prev, [model.id]: result.models }));
    }
  }, []);

  const runAgentTest = useCallback(async (agent: AgentEndpoint) => {
    setTests((prev) => ({
      ...prev,
      [agent.id]: { ok: false, detail: "Fetching agent card…" },
    }));
    const result = await fetchAgentCard(agent);
    setTests((prev) => ({
      ...prev,
      [agent.id]: { ok: result.ok, detail: result.detail },
    }));
  }, []);

  const addModel = useCallback(() => {
    update({
      ...current,
      models: [
        ...current.models,
        {
          id: createId(),
          kind: "llama.cpp",
          name: "Local llama.cpp",
          baseURL: PROVIDER_KINDS["llama.cpp"].baseURLPlaceholder,
        },
      ],
    });
  }, [current, update]);

  const addAgent = useCallback(() => {
    update({
      ...current,
      agents: [
        ...current.agents,
        { id: createId(), name: "Agent", baseURL: "http://localhost:8301" },
      ],
    });
  }, [current, update]);

  const hasAnything = useMemo(
    () =>
      current.models.length > 0 ||
      current.agents.length > 0 ||
      Boolean(current.collabServer) ||
      Boolean(current.aiBackend),
    [current],
  );

  return (
    <Dialog
      title="Settings"
      size="wide"
      onCloseRequest={() => setDialogState({ isOpen: false })}
      className="settings-dialog"
    >
      <div className="settings-dialog__intro">
        <p>
          Point the tool at the models and agents you already have. Everything
          is stored on this machine only.
        </p>
        {!hasAnything && (
          <p className="settings-dialog__local-only">
            Nothing is configured, so the app is local-only: it draws, saves and
            exports, and contacts no server.
          </p>
        )}
      </div>

      <section className="settings-dialog__section">
        <header>
          <h3>Models</h3>
          <FilledButton size="medium" onClick={addModel}>
            Add a model
          </FilledButton>
        </header>

        {current.models.length === 0 && (
          <p className="settings-dialog__empty">
            No model connected. The AI features stay hidden until one is.
          </p>
        )}

        {current.models.map((model) => {
          const meta = PROVIDER_KINDS[model.kind];
          const redacted = redactProvider(model);
          const test = tests[model.id];
          const discovered = discoveries[model.id];
          const shape = model.shape ?? meta.defaultShape;

          return (
            <div className="settings-dialog__entry" key={model.id}>
              <div className="settings-dialog__entry-head">
                <TextField
                  label="Name"
                  value={model.name}
                  onChange={(value) => setModel(model.id, { name: value })}
                />
                <label className="settings-dialog__field">
                  <span className="settings-dialog__label">Type</span>
                  <select
                    value={model.kind}
                    onChange={(event) =>
                      setModel(model.id, {
                        kind: event.target.value as ProviderKind,
                        shape: undefined,
                      })
                    }
                  >
                    {PROVIDER_KIND_ORDER.map((kind) => (
                      <option key={kind} value={kind}>
                        {PROVIDER_KINDS[kind].label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="settings-dialog__remove"
                  aria-label={`Remove ${model.name}`}
                  title="Remove"
                  onClick={() =>
                    update({
                      ...current,
                      models: current.models.filter((m) => m.id !== model.id),
                    })
                  }
                >
                  {TrashIcon}
                </button>
              </div>

              <p className="settings-dialog__hint">{meta.description}</p>

              <TextField
                label="Base URL"
                value={model.baseURL}
                placeholder={meta.baseURLPlaceholder}
                onChange={(value) => setModel(model.id, { baseURL: value })}
              />

              {meta.keyExpected && (
                <label className="settings-dialog__field">
                  <span className="settings-dialog__label">
                    {redacted.hasApiKey
                      ? "API key (saved — type a new one to replace)"
                      : "API key"}
                  </span>
                  <input
                    className="settings-dialog__input"
                    type="password"
                    autoComplete="off"
                    value={keyDrafts[model.id] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setKeyDrafts((prev) => ({ ...prev, [model.id]: value }));
                      setModel(model.id, { apiKey: value || undefined });
                    }}
                  />
                </label>
              )}

              {model.kind === "opencode-zen" && (
                <label className="settings-dialog__field">
                  <span className="settings-dialog__label">
                    Request shape (the gateway serves several)
                  </span>
                  <select
                    value={shape}
                    onChange={(event) =>
                      setModel(model.id, {
                        shape: event.target.value as ProviderShape,
                      })
                    }
                  >
                    {(Object.keys(SHAPE_LABELS) as ProviderShape[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {SHAPE_LABELS[key]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}

              <label className="settings-dialog__field">
                <span className="settings-dialog__label">Model</span>
                {discovered?.length ? (
                  <select
                    value={model.model ?? ""}
                    onChange={(event) =>
                      setModel(model.id, { model: event.target.value })
                    }
                  >
                    <option value="">— pick a model —</option>
                    {discovered.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="settings-dialog__input"
                    value={model.model ?? ""}
                    placeholder="model id"
                    onChange={(event) =>
                      setModel(model.id, { model: event.target.value })
                    }
                  />
                )}
              </label>

              <div className="settings-dialog__actions">
                <FilledButton size="medium" onClick={() => runModelTest(model)}>
                  Test connection
                </FilledButton>
                {meta.discoverable && (
                  <FilledButton
                    size="medium"
                    variant="outlined"
                    onClick={() => runDiscovery(model)}
                  >
                    List models
                  </FilledButton>
                )}
                {test && (
                  <span
                    className={
                      test.ok
                        ? "settings-dialog__result is-ok"
                        : "settings-dialog__result is-error"
                    }
                  >
                    {test.detail}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="settings-dialog__section">
        <header>
          <h3>Agents</h3>
          <FilledButton size="medium" onClick={addAgent}>
            Add an agent
          </FilledButton>
        </header>
        {current.agents.length === 0 && (
          <p className="settings-dialog__empty">No agent connected.</p>
        )}
        {current.agents.map((agent) => {
          const test = tests[agent.id];
          return (
            <div className="settings-dialog__entry" key={agent.id}>
              <div className="settings-dialog__entry-head">
                <TextField
                  label="Name"
                  value={agent.name}
                  onChange={(value) => setAgent(agent.id, { name: value })}
                />
                <button
                  type="button"
                  className="settings-dialog__remove"
                  aria-label={`Remove ${agent.name}`}
                  title="Remove"
                  onClick={() =>
                    update({
                      ...current,
                      agents: current.agents.filter((a) => a.id !== agent.id),
                    })
                  }
                >
                  {TrashIcon}
                </button>
              </div>
              <TextField
                label="Agent base URL"
                value={agent.baseURL}
                placeholder="http://localhost:8301"
                onChange={(value) => setAgent(agent.id, { baseURL: value })}
              />
              <p className="settings-dialog__hint">
                Tested by fetching {"{base}"}/.well-known/agent-card.json.
              </p>
              <div className="settings-dialog__actions">
                <FilledButton size="medium" onClick={() => runAgentTest(agent)}>
                  Test connection
                </FilledButton>
                {test && (
                  <span
                    className={
                      test.ok
                        ? "settings-dialog__result is-ok"
                        : "settings-dialog__result is-error"
                    }
                  >
                    {test.detail}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="settings-dialog__section">
        <header>
          <h3>Servers</h3>
        </header>
        <TextField
          label="Collaboration server (WebSocket)"
          value={current.collabServer ?? ""}
          placeholder="http://localhost:3002"
          onChange={(value) =>
            update({ ...current, collabServer: value || undefined })
          }
        />
        <p className="settings-dialog__hint">
          Empty means collaboration is unavailable — the app never falls back to
          a hosted service.
        </p>
        <TextField
          label="AI text-to-diagram backend"
          value={current.aiBackend ?? ""}
          placeholder="http://localhost:4173"
          onChange={(value) =>
            update({ ...current, aiBackend: value || undefined })
          }
        />
        <p className="settings-dialog__hint">Empty hides the AI panel.</p>
      </section>
    </Dialog>
  );
};
