"use client";

/**
 * NEXT_PUBLIC_* env vars are statically replaced by Next.js at build time, so
 * `process` doesn't need to exist at runtime. We declare just enough of it
 * here to satisfy TypeScript in the modules package, which doesn't pull in
 * `@types/node`.
 */
declare const process: { env: Record<string, string | undefined> };

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cubism/protocol";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import type { ControlsProps } from "../types";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_LLM_MODEL,
  DEFAULT_LM_STUDIO_URL,
  DEFAULT_MAX_TURNS,
  DEFAULT_RESPONSE_COLOR,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TRANSCRIPT_COLOR,
  DEFAULT_TTS_ENABLED,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_URL,
  DEFAULT_TTS_VOICE,
  DEFAULT_WHISPER_LANGUAGE,
  DEFAULT_WHISPER_MODEL,
  DEFAULT_WHISPER_URL,
  type AiAssistantConfig,
} from "./config";

type LastInteraction = {
  transcript?: string;
  response?: string;
  error?: string;
  at?: string;
};

type ConnTestState = "idle" | "testing" | "ok" | "fail";

export function AiAssistantControls({
  config,
  onChange,
}: ControlsProps<AiAssistantConfig>) {
  function patch(next: Partial<AiAssistantConfig>) {
    onChange({ ...config, ...next });
  }

  const lmStudioUrl = config.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL;
  const llmModel = config.llmModel ?? DEFAULT_LLM_MODEL;
  const whisperUrl = config.whisperUrl ?? DEFAULT_WHISPER_URL;
  const whisperModel = config.whisperModel ?? DEFAULT_WHISPER_MODEL;
  const whisperLanguage = config.whisperLanguage ?? DEFAULT_WHISPER_LANGUAGE;
  const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  const ttsEnabled = config.ttsEnabled ?? DEFAULT_TTS_ENABLED;
  const ttsUrl = config.ttsUrl ?? DEFAULT_TTS_URL;
  const ttsVoice = config.ttsVoice ?? DEFAULT_TTS_VOICE;
  const ttsModel = config.ttsModel ?? DEFAULT_TTS_MODEL;
  const accentColor = config.accentColor ?? DEFAULT_ACCENT_COLOR;
  const transcriptColor = config.transcriptColor ?? DEFAULT_TRANSCRIPT_COLOR;
  const responseColor = config.responseColor ?? DEFAULT_RESPONSE_COLOR;
  const rotation = config.rotation ?? 0;

  const [last, setLast] = useState<LastInteraction>({});
  const [lmTest, setLmTest] = useState<ConnTestState>("idle");
  const [whisperTest, setWhisperTest] = useState<ConnTestState>("idle");
  const [ttsTest, setTtsTest] = useState<ConnTestState>("idle");
  const [lmTestMsg, setLmTestMsg] = useState<string>("");
  const [whisperTestMsg, setWhisperTestMsg] = useState<string>("");
  const [ttsTestMsg, setTtsTestMsg] = useState<string>("");

  const userId =
    process.env.NEXT_PUBLIC_DEMO_USER_ID ??
    process.env.NEXT_PUBLIC_USER_ID ??
    "demo-user";
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);

  /**
   * Lightweight side-channel socket purely so the Controls panel can
   * show a "last interaction" trace and offer a reset button. We
   * intentionally do NOT listen to ai:tts here — the parent desktop
   * page owns the speech synthesis call so it doesn't double-fire.
   */
  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL &&
      process.env.NEXT_PUBLIC_SOCKET_URL.length > 0
        ? process.env.NEXT_PUBLIC_SOCKET_URL
        : "";
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      url || (typeof window !== "undefined" ? window.location.origin : ""),
      { reconnection: true },
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      // Register as a "controller" — same role used by Pi-side input
      // devices — so we land in user:${userId} without claiming to be
      // a renderer or a second desktop control surface.
      socket.emit("client:register", { role: "controller", userId });
    });

    socket.on("ai:transcript", (payload) => {
      setLast((prev) => ({
        ...prev,
        transcript: payload.text,
        error: undefined,
        at: new Date().toISOString(),
      }));
    });
    socket.on("ai:response", (payload) => {
      setLast((prev) => ({
        ...prev,
        response: payload.text,
        error: undefined,
        at: new Date().toISOString(),
      }));
    });
    socket.on("ai:error", (payload) => {
      setLast((prev) => ({
        ...prev,
        error: payload.message,
        at: new Date().toISOString(),
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  function resetConversation() {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit("ai:reset", { userId });
    setLast({});
  }

  // Connection tests just probe the OpenAI-compatible base URL for a
  // models list — both LM Studio and faster-whisper-server expose
  // `/models`, so this works as a generic "is anyone home?" check.
  //
  // We route the probe through the desktop's own `/api/ai/test` endpoint
  // instead of fetching the upstream directly, because LM Studio and
  // faster-whisper-server don't enable CORS by default and a
  // browser→127.0.0.1:8000 request would be rejected as "Failed to
  // fetch" before it ever leaves the page.
  async function testConnection(
    kind: "lmStudio" | "whisper" | "tts",
    url: string,
  ): Promise<void> {
    const setState =
      kind === "lmStudio"
        ? setLmTest
        : kind === "whisper"
          ? setWhisperTest
          : setTtsTest;
    const setMsg =
      kind === "lmStudio"
        ? setLmTestMsg
        : kind === "whisper"
          ? setWhisperTestMsg
          : setTtsTestMsg;
    setState("testing");
    setMsg("");
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Forward the `kind` so the server can decide whether to
        // attach a bearer token (e.g. LM Studio with auth enabled
        // for MCP) without ever exposing the key to the browser.
        body: JSON.stringify({ url, kind }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        status?: number;
      };
      if (data.ok) {
        setState("ok");
        setMsg("Reachable");
      } else {
        setState("fail");
        setMsg(data.error ?? "Unreachable");
      }
    } catch (err) {
      setState("fail");
      setMsg(err instanceof Error ? err.message : "Connection refused");
    }
  }

  const lastAt = useMemo(
    () =>
      last.at
        ? new Date(last.at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : null,
    [last.at],
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">LM Studio</h3>
        <p className="text-xs text-zinc-500">
          OpenAI-compatible chat endpoint. Defaults to the LM Studio local
          server.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Base URL</span>
            <input
              type="text"
              className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
              value={lmStudioUrl}
              onChange={(e) => patch({ lmStudioUrl: e.target.value.trim() })}
              placeholder={DEFAULT_LM_STUDIO_URL}
              spellCheck={false}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => testConnection("lmStudio", lmStudioUrl)}
              disabled={lmTest === "testing"}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {lmTest === "testing" ? "Testing…" : "Test"}
            </button>
          </div>
        </div>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Model</span>
          <input
            type="text"
            className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
            value={llmModel}
            onChange={(e) => patch({ llmModel: e.target.value.trim() })}
            placeholder="e.g. qwen/qwen3.5-9b (or empty → uses CUBISM_LLM_MODEL)"
            spellCheck={false}
          />
        </label>
        {lmTest !== "idle" && lmTestMsg ? (
          <p
            className={`mt-2 text-xs ${lmTest === "ok" ? "text-emerald-400" : lmTest === "fail" ? "text-red-400" : "text-zinc-400"}`}
          >
            {lmTestMsg}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Whisper (STT)</h3>
        <p className="text-xs text-zinc-500">
          OpenAI-compatible audio/transcriptions endpoint. Recommended:
          faster-whisper-server.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Base URL</span>
            <input
              type="text"
              className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
              value={whisperUrl}
              onChange={(e) => patch({ whisperUrl: e.target.value.trim() })}
              placeholder={DEFAULT_WHISPER_URL}
              spellCheck={false}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => testConnection("whisper", whisperUrl)}
              disabled={whisperTest === "testing"}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {whisperTest === "testing" ? "Testing…" : "Test"}
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Model</span>
            <input
              type="text"
              className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
              value={whisperModel}
              onChange={(e) => patch({ whisperModel: e.target.value.trim() })}
              placeholder={DEFAULT_WHISPER_MODEL}
              spellCheck={false}
            />
            <span className="text-xs text-zinc-500">
              Multilingual by default. Append <code>.en</code> for an
              English-only variant.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Language</span>
            <select
              className="rounded-lg bg-zinc-800 px-3 py-2 text-white"
              value={whisperLanguage}
              onChange={(e) => patch({ whisperLanguage: e.target.value })}
            >
              <option value="">Auto-detect</option>
              <option value="en">English</option>
              <option value="ko">Korean (한국어)</option>
              <option value="ja">Japanese (日本語)</option>
              <option value="zh">Chinese (中文)</option>
              <option value="es">Spanish (Español)</option>
              <option value="fr">French (Français)</option>
              <option value="de">German (Deutsch)</option>
              <option value="it">Italian (Italiano)</option>
              <option value="pt">Portuguese (Português)</option>
              <option value="ru">Russian (Русский)</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="ar">Arabic (العربية)</option>
            </select>
            <span className="text-xs text-zinc-500">
              Skip Whisper&apos;s detection step — faster and more
              accurate on short clips.
            </span>
          </label>
        </div>
        {whisperTest !== "idle" && whisperTestMsg ? (
          <p
            className={`mt-2 text-xs ${whisperTest === "ok" ? "text-emerald-400" : whisperTest === "fail" ? "text-red-400" : "text-zinc-400"}`}
          >
            {whisperTestMsg}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Piper TTS (Voice)
            </h3>
            <p className="text-xs text-zinc-500">
              OpenAI-compatible /v1/audio/speech endpoint. Recommended:
              OpenedAI Speech (Piper). Disable to fall back to the desktop
              browser&apos;s built-in voice.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => patch({ ttsEnabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <div
          className={`mt-3 grid gap-3 sm:grid-cols-[1fr_auto] ${ttsEnabled ? "" : "opacity-50"}`}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Base URL</span>
            <input
              type="text"
              className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
              value={ttsUrl}
              onChange={(e) => patch({ ttsUrl: e.target.value.trim() })}
              placeholder={DEFAULT_TTS_URL}
              spellCheck={false}
              disabled={!ttsEnabled}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => testConnection("tts", ttsUrl)}
              disabled={!ttsEnabled || ttsTest === "testing"}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {ttsTest === "testing" ? "Testing…" : "Test"}
            </button>
          </div>
        </div>
        <div
          className={`mt-3 grid gap-3 sm:grid-cols-2 ${ttsEnabled ? "" : "opacity-50"}`}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Voice</span>
            <input
              type="text"
              className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
              value={ttsVoice}
              onChange={(e) => patch({ ttsVoice: e.target.value.trim() })}
              placeholder={DEFAULT_TTS_VOICE}
              spellCheck={false}
              disabled={!ttsEnabled}
            />
            <span className="text-xs text-zinc-500">
              OpenAI alias (alloy, echo, fable, onyx, nova, shimmer) or a
              Piper voice id like en_US-amy-medium.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Model</span>
            <input
              type="text"
              className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
              value={ttsModel}
              onChange={(e) => patch({ ttsModel: e.target.value.trim() })}
              placeholder={DEFAULT_TTS_MODEL}
              spellCheck={false}
              disabled={!ttsEnabled}
            />
          </label>
        </div>
        {ttsTest !== "idle" && ttsTestMsg ? (
          <p
            className={`mt-2 text-xs ${ttsTest === "ok" ? "text-emerald-400" : ttsTest === "fail" ? "text-red-400" : "text-zinc-400"}`}
          >
            {ttsTestMsg}
          </p>
        ) : null}
      </section>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">System prompt</span>
        <textarea
          rows={4}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-white"
          value={systemPrompt}
          onChange={(e) => patch({ systemPrompt: e.target.value })}
        />
        <span className="text-xs text-zinc-500">
          Keep it short — responses are read aloud and shown on a small
          display.
        </span>
      </label>

      <label className="flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-zinc-400">Conversation memory</span>
          <span className="font-mono text-xs text-zinc-500">
            {maxTurns} turn{maxTurns === 1 ? "" : "s"}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={maxTurns}
          onChange={(e) =>
            patch({ maxTurns: Number.parseInt(e.target.value, 10) })
          }
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400 text-sm">Colors</span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => patch({ accentColor: e.target.value })}
              aria-label="Accent color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Accent</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={transcriptColor}
              onChange={(e) => patch({ transcriptColor: e.target.value })}
              aria-label="Transcript color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Transcript</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={responseColor}
              onChange={(e) => patch({ responseColor: e.target.value })}
              aria-label="Response color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Response</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400 text-sm">Orientation</span>
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
              onChange={(e) => patch({ flipHorizontal: e.target.checked })}
            />
            Mirror horizontal
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipVertical ?? false}
              onChange={(e) => patch({ flipVertical: e.target.checked })}
            />
            Mirror vertical
          </label>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">
            Last interaction
          </h3>
          <button
            type="button"
            onClick={resetConversation}
            className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Reset conversation
          </button>
        </div>
        {last.transcript || last.response || last.error ? (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {last.transcript ? (
              <p>
                <span className="text-zinc-500">You: </span>
                <span className="italic text-zinc-300">
                  “{last.transcript}”
                </span>
              </p>
            ) : null}
            {last.response ? (
              <p>
                <span className="text-zinc-500">Assistant: </span>
                <span className="text-zinc-100">{last.response}</span>
              </p>
            ) : null}
            {last.error ? (
              <p className="text-red-400">{last.error}</p>
            ) : null}
            {lastAt ? (
              <p className="text-xs text-zinc-500">at {lastAt}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            Press the center key on the Pi to start talking. Results will
            show up here.
          </p>
        )}
      </section>
    </div>
  );
}
