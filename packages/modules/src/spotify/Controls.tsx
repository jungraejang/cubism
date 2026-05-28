"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import type { ControlsProps } from "../types";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DETAIL_COLOR,
  DEFAULT_TEXT_COLOR,
  SPOTIFY_SCOPES,
  type SpotifyModuleConfig,
} from "./config";

type AuthMessage = {
  type: "cubism:spotify-auth";
  code?: string | null;
  state?: string | null;
  error?: string | null;
};

/**
 * Builds the redirect URI for Spotify. As of 2025, Spotify rejects `localhost`
 * in redirect URIs — only the loopback IPs `127.0.0.1` and `[::1]` are
 * accepted for non-HTTPS origins. We normalize the host here so the URI we
 * register in the Dashboard always works, regardless of how the user opened
 * the desktop app.
 *
 * The returned URI must be added verbatim to the Spotify Dashboard's
 * "Redirect URIs" allow-list.
 */
function getRedirectUri(): string {
  if (typeof window === "undefined") return "";
  const url = new URL("/api/spotify/callback", window.location.origin);
  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }
  return url.toString();
}

function buildAuthUrl(clientId: string, state: string, redirectUri: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: "false",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function SpotifyControls({
  config,
  onChange,
}: ControlsProps<SpotifyModuleConfig>) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const stateRef = useRef<string | null>(null);

  useEffect(() => {
    setRedirectUri(getRedirectUri());
  }, []);

  /**
   * configRef lets the postMessage handler (registered once) read the latest
   * client id/secret without re-binding the listener on every keystroke.
   */
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  function patch(next: Partial<SpotifyModuleConfig>) {
    onChange({ ...config, ...next });
  }

  const accentColor = config.accentColor ?? DEFAULT_ACCENT_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const detailColor = config.detailColor ?? DEFAULT_DETAIL_COLOR;
  const rotation = config.rotation ?? 0;
  const isConnected = Boolean(config.refreshToken);

  const handleAuthMessage = useCallback(
    async (event: MessageEvent) => {
      const data = event.data as AuthMessage | undefined;
      if (!data || data.type !== "cubism:spotify-auth") return;
      if (!stateRef.current || data.state !== stateRef.current) {
        setStatus("Auth state mismatch — try connecting again.");
        return;
      }
      stateRef.current = null;
      if (data.error) {
        setStatus(`Spotify denied the request: ${data.error}`);
        setBusy(false);
        return;
      }
      if (!data.code) {
        setStatus("Spotify did not return an authorization code.");
        setBusy(false);
        return;
      }

      try {
        setStatus("Exchanging code for refresh token…");
        const res = await fetch("/api/spotify/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: data.code,
            clientId: configRef.current.clientId,
            clientSecret: configRef.current.clientSecret,
            redirectUri: getRedirectUri(),
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(err?.error ?? `Exchange failed (${res.status})`);
        }
        const body = (await res.json()) as {
          refreshToken: string;
          displayName?: string;
        };
        onChange({
          ...configRef.current,
          refreshToken: body.refreshToken,
          displayName: body.displayName,
        });
        setStatus(
          body.displayName
            ? `Connected as ${body.displayName}.`
            : "Connected.",
        );
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Connection failed.");
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  useEffect(() => {
    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, [handleAuthMessage]);

  function startAuth() {
    if (!config.clientId || !config.clientSecret) {
      setStatus("Enter Client ID and Client Secret first.");
      return;
    }
    if (!redirectUri) return;
    const state = crypto.randomUUID();
    stateRef.current = state;
    setBusy(true);
    setStatus("Opening Spotify…");
    const url = buildAuthUrl(config.clientId, state, redirectUri);
    const popup = window.open(
      url,
      "cubism-spotify-auth",
      "width=500,height=700",
    );
    if (!popup) {
      setBusy(false);
      setStatus("Popup was blocked — allow popups and try again.");
    }
  }

  function disconnect() {
    onChange({
      ...config,
      refreshToken: "",
      displayName: undefined,
    });
    setStatus("Disconnected.");
  }

  function copyRedirectUri() {
    if (!redirectUri) return;
    void navigator.clipboard.writeText(redirectUri).then(
      () => setStatus("Redirect URI copied to clipboard."),
      () => setStatus("Could not copy — select the URI and copy manually."),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          Spotify Developer Setup
        </h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
          <li>
            Open the{" "}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 underline"
            >
              Spotify Developer Dashboard
            </a>{" "}
            and create an app (any name).
          </li>
          <li>
            Add this <span className="text-zinc-200">Redirect URI</span>{" "}
            <em>exactly</em> — Spotify requires{" "}
            <span className="font-mono text-zinc-200">127.0.0.1</span> (not{" "}
            <span className="font-mono">localhost</span>):
          </li>
          <li>
            Copy the app&apos;s Client ID + Client Secret into the fields
            below, then click <span className="text-zinc-200">Connect Spotify</span>.
          </li>
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={redirectUri}
            className="flex-1 rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-cyan-200"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copyRedirectUri}
            className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-zinc-400">Client ID</span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-sm text-white"
            value={config.clientId}
            onChange={(event) =>
              patch({ clientId: event.target.value.trim() })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-zinc-400">Client Secret</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-sm text-white"
            value={config.clientSecret}
            onChange={(event) =>
              patch({ clientSecret: event.target.value.trim() })
            }
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.02 }}
          onClick={startAuth}
          disabled={busy}
          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {isConnected ? "Reconnect Spotify" : "Connect Spotify"}
        </motion.button>
        {isConnected ? (
          <button
            type="button"
            onClick={disconnect}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            Disconnect
          </button>
        ) : null}
        <div className="text-sm">
          {isConnected ? (
            <span className="text-green-300">
              Connected{config.displayName ? ` as ${config.displayName}` : ""}.
            </span>
          ) : (
            <span className="text-zinc-500">Not connected.</span>
          )}
        </div>
      </div>

      {status ? (
        <p className="text-xs text-zinc-400" role="status">
          {status}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Colors</span>
          <p className="text-xs text-zinc-500">
            Album glow, track text, secondary details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={accentColor}
              onChange={(event) => patch({ accentColor: event.target.value })}
              aria-label="Accent color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Accent</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={textColor}
              onChange={(event) => patch({ textColor: event.target.value })}
              aria-label="Text color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Text</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={detailColor}
              onChange={(event) => patch({ detailColor: event.target.value })}
              aria-label="Detail color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Details</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400">Orientation</span>
        <div className="flex flex-wrap gap-2">
          {ROTATION_OPTIONS.map((option) => (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => patch({ rotation: option.value })}
              className={`rounded-lg px-3 py-2 text-sm ${
                rotation === option.value
                  ? "bg-cyan-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipHorizontal ?? false}
              onChange={(event) =>
                patch({ flipHorizontal: event.target.checked })
              }
            />
            Mirror horizontal
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipVertical ?? false}
              onChange={(event) =>
                patch({ flipVertical: event.target.checked })
              }
            />
            Mirror vertical
          </label>
        </div>
      </div>
    </div>
  );
}
