/**
 * Browser-localStorage persistence for the desktop control panel.
 *
 * We persist the user-facing pieces of `DesktopHomePage` state — which
 * module is selected, the per-module config map, and the auto-rotate
 * interval — so a tab refresh (or accidental close) doesn't wipe a
 * carefully tuned set of sliders and toggles back to manifest defaults.
 *
 * Design notes:
 * - localStorage is only available in the browser. Every helper here
 *   guards on `typeof window` so it's safe to import from a Next.js
 *   client component that may still be rendered on the server during
 *   the initial pass.
 * - Configs are validated with each module's own Zod schema on load.
 *   This is the only thing keeping a stale stored config from breaking
 *   a module after we bump its schema (e.g. removed `performanceMode`,
 *   added `style`); unknown fields are stripped and missing required
 *   fields fall back to the manifest default for that module.
 * - A small `schemaVersion` field lets us nuke the bucket if the shape
 *   itself ever changes (e.g. we add a new top-level field that the
 *   reducer doesn't know how to default).
 */
import { modules } from "@cubism/modules";

const STORAGE_KEY = "cubism.desktop.state.v1";
const SCHEMA_VERSION = 2;

/**
 * Per-module list of config fields to strip before writing to
 * localStorage. Anything that's a secret, an OAuth credential, or
 * personally-identifying lives here so a stolen / shared browser
 * profile can't lift them off disk.
 *
 * Strip rules:
 * - Secrets (API keys, client secrets, refresh tokens) — never.
 * - PII / location — never (ZIP codes, real names).
 * - The Spotify OAuth `clientId` isn't strictly secret, but it pairs
 *   with `clientSecret` and the Controls panel re-populates it from
 *   `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` on mount anyway, so we drop it for
 *   symmetry and to avoid leaving identifying breadcrumbs.
 *
 * Add new entries here when introducing a module that stores any
 * sensitive field — the rest of the persistence pipeline picks the
 * change up automatically.
 *
 * NOTE: The AI Assistant module's LM Studio bearer token is read from
 * the desktop process's `LM_STUDIO_API_KEY` env var on the server and
 * never enters module config, so nothing needs redacting here.
 */
const MODULE_REDACTED_FIELDS: Record<string, readonly string[]> = {
  spotify: ["clientId", "clientSecret", "refreshToken", "displayName"],
  weather: ["zipCode"],
};

export type PersistedDesktopState = {
  selectedId: string;
  configByModule: Record<string, unknown>;
  autoRotateMs: number | null;
};

type StoredEnvelope = {
  schemaVersion: number;
  state: PersistedDesktopState;
};

/** Drop the redacted keys from a single module's config object. */
function redactConfig(moduleId: string, config: unknown): unknown {
  const fields = MODULE_REDACTED_FIELDS[moduleId];
  if (!fields || !config || typeof config !== "object") return config;
  const out: Record<string, unknown> = { ...(config as Record<string, unknown>) };
  for (const f of fields) delete out[f];
  return out;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Build a config map seeded with each module's manifest defaults. Used
 * as the base that loaded values get merged on top of, so a stored
 * payload missing entries for newly-added modules still ends up with
 * sensible defaults for them.
 */
export function buildDefaultConfigMap(): Record<string, unknown> {
  return Object.fromEntries(
    modules.map((m) => [m.manifest.id, m.manifest.defaultConfig]),
  );
}

/**
 * Read the persisted state and validate each stored module config
 * against the module's current Zod schema. Unknown modules in storage
 * are dropped; modules whose stored config no longer parses fall back
 * to the manifest default for that module alone, so one broken
 * module's schema bump never resets the whole panel.
 */
export function loadPersistedState(): PersistedDesktopState | null {
  if (!isBrowser()) return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-mode Safari and friends throw on access. Treat as "no
    // saved state" rather than crashing the panel.
    return null;
  }
  if (!raw) return null;

  let envelope: StoredEnvelope;
  try {
    envelope = JSON.parse(raw) as StoredEnvelope;
  } catch {
    return null;
  }
  if (!envelope || envelope.schemaVersion !== SCHEMA_VERSION) return null;
  const incoming = envelope.state;
  if (!incoming || typeof incoming !== "object") return null;

  const validConfigs: Record<string, unknown> = buildDefaultConfigMap();
  const storedConfigs =
    incoming.configByModule && typeof incoming.configByModule === "object"
      ? (incoming.configByModule as Record<string, unknown>)
      : {};
  for (const mod of modules) {
    const stored = storedConfigs[mod.manifest.id];
    if (stored === undefined || stored === null || typeof stored !== "object") {
      continue;
    }
    // Merge the stored object on top of manifest defaults so any
    // redacted fields (missing from storage by design) snap back to
    // their default value — typically empty strings for secrets and
    // tokens — and the Zod schema still validates required keys.
    const merged = {
      ...(mod.manifest.defaultConfig as Record<string, unknown>),
      ...(stored as Record<string, unknown>),
    };
    const parsed = mod.configSchema.safeParse(merged);
    if (parsed.success) {
      validConfigs[mod.manifest.id] = parsed.data;
    }
  }

  const selectedId =
    typeof incoming.selectedId === "string" &&
    modules.some((m) => m.manifest.id === incoming.selectedId)
      ? incoming.selectedId
      : modules[0].manifest.id;

  const autoRotateMs =
    incoming.autoRotateMs === null ||
    (typeof incoming.autoRotateMs === "number" && incoming.autoRotateMs > 0)
      ? incoming.autoRotateMs
      : null;

  return { selectedId, configByModule: validConfigs, autoRotateMs };
}

export function savePersistedState(state: PersistedDesktopState): void {
  if (!isBrowser()) return;
  // Strip blacklisted (sensitive / identifying) fields from every
  // module's config before serializing. The original in-memory state
  // is untouched so the live panel keeps the user's credentials for
  // the current session.
  const sanitizedConfigs: Record<string, unknown> = {};
  for (const [moduleId, cfg] of Object.entries(state.configByModule)) {
    sanitizedConfigs[moduleId] = redactConfig(moduleId, cfg);
  }
  const envelope: StoredEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    state: {
      selectedId: state.selectedId,
      autoRotateMs: state.autoRotateMs,
      configByModule: sanitizedConfigs,
    },
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage disabled — silently drop. The panel
    // keeps working in-memory; the user just loses persistence for
    // this session.
  }
}

export function clearPersistedState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
