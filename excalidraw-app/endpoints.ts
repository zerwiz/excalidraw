/**
 * Endpoints — the single place every remote host is resolved.
 *
 * This fork ships with **no hosted default**. An endpoint that is unset means the
 * feature which needs it is unavailable — never that the app silently falls back to
 * an Excalidraw-controlled service. See `RULES/08-tickets.md` and
 * `tickets/open/feature-0001-uw-sever-all-excalidraw-hosted-connections.md`.
 *
 * The Settings surface (`feature-0002`) will make these operator-configurable at
 * runtime; today they read from env, empty by default.
 */

const clean = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed === "" ? undefined : trimmed;
};

const env = import.meta.env;

export const ENDPOINTS = {
  /** where a shared scene is persisted, read and write (share links) */
  sceneBackendGet: clean(env.VITE_APP_BACKEND_V2_GET_URL),
  sceneBackendPost: clean(env.VITE_APP_BACKEND_V2_POST_URL),
  /** the community library — browsing and publishing are separate hosts */
  libraryUrl: clean(env.VITE_APP_LIBRARY_URL),
  libraryBackend: clean(env.VITE_APP_LIBRARY_BACKEND),
  /** the collaboration WebSocket server */
  collabServer: clean(env.VITE_APP_WS_SERVER_URL),
  /** the AI text-to-diagram backend */
  aiBackend: clean(env.VITE_APP_AI_BACKEND),
  /** error reporting — absent means no error reporting at all */
  sentryDsn: clean(env.VITE_APP_SENTRY_DSN),
} as const;

/**
 * Which capabilities the current configuration actually has. A UI surface gates
 * on these rather than assuming a host exists.
 */
export const features = {
  sceneSharing: Boolean(
    ENDPOINTS.sceneBackendGet && ENDPOINTS.sceneBackendPost,
  ),
  libraryBrowse: Boolean(ENDPOINTS.libraryUrl),
  libraryPublish: Boolean(ENDPOINTS.libraryBackend),
  collaboration: Boolean(ENDPOINTS.collabServer),
  ai: Boolean(ENDPOINTS.aiBackend),
  errorReporting: Boolean(ENDPOINTS.sentryDsn),
} as const;

/** Thrown when a feature is used that this configuration has not enabled. */
export class EndpointNotConfiguredError extends Error {
  constructor(feature: string) {
    super(
      `${feature} is not configured. Set the matching endpoint to enable it; ` +
        `this build contacts no hosted service by default.`,
    );
    this.name = "EndpointNotConfiguredError";
  }
}
