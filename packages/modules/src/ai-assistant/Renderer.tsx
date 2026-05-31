"use client";

/**
 * NEXT_PUBLIC_* env vars are statically replaced by Next.js at build time, so
 * `process` doesn't need to exist at runtime. We declare just enough of it
 * here to satisfy TypeScript in the modules package, which doesn't pull in
 * `@types/node`.
 */
declare const process: { env: Record<string, string | undefined> };

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cubism/protocol";
import type { RendererProps } from "../types";
import { randomId } from "../_lib/randomId";
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
import { PushToTalkRecorder } from "./recorder";

type UiState = "idle" | "recording" | "processing" | "speaking" | "error";

/**
 * Visual state machine:
 *   idle       → "Press center button to talk" + mic icon
 *   recording  → pulsing red ring + live level meter
 *   processing → spinner + small "you said: …"
 *   speaking   → assistant response shown large
 *   error      → red message, auto-clears after 4s
 *
 * Transitions are driven by:
 *   - keyboard (Space/Enter) → start/stop recording
 *   - server (ai:state/transcript/response/error) → enter/exit processing
 *   - speaking → idle is normally driven by `ai:speech-end` from the
 *     desktop (which actually plays the TTS audio and knows exactly
 *     when it stops). We additionally keep a length-based fallback
 *     timer so the response can't get stuck on screen if the desktop
 *     crashes mid-clip or the renderer somehow misses the event.
 */
const ERROR_TIMEOUT_MS = 4000;

/**
 * Fallback display duration in milliseconds, derived from response
 * length so a long answer doesn't disappear before the user has had
 * a chance to read it (or before the TTS audio is even halfway
 * through). Tuned around ~180 WPM speech rate plus a 2 s "let it
 * settle" tail. Clamped to a sane window so a one-word answer still
 * lingers a beat, and a runaway 300-word reply still eventually
 * clears.
 */
function computeSpeakingTimeoutMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  const estimatedSpeechMs = words * 380;
  const padded = estimatedSpeechMs + 2000;
  return Math.max(6000, Math.min(45000, padded));
}

export function AiAssistantRenderer({
  config,
}: RendererProps<AiAssistantConfig>) {
  const accentColor = config.accentColor ?? DEFAULT_ACCENT_COLOR;
  const transcriptColor = config.transcriptColor ?? DEFAULT_TRANSCRIPT_COLOR;
  const responseColor = config.responseColor ?? DEFAULT_RESPONSE_COLOR;
  const rotation = config.rotation ?? 0;
  const scaleX = config.flipHorizontal ? -1 : 1;
  const scaleY = config.flipVertical ? -1 : 1;

  const [uiState, setUiState] = useState<UiState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [micLevel, setMicLevel] = useState<number>(0);

  /**
   * The active request id ties together transcript/response/error events
   * on the wire. We bump it on every new recording so any in-flight
   * results from a previous, cancelled request can be silently dropped.
   */
  const currentRequestIdRef = useRef<string | null>(null);
  const recorderRef = useRef<PushToTalkRecorder | null>(null);
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const uiStateRef = useRef<UiState>("idle");
  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  // Sourced from the renderer app's env at build time — same vars the page
  // already reads. Falling back to the same demo defaults keeps the
  // dev-loop working without an .env.local.
  const userId = process.env.NEXT_PUBLIC_USER_ID ?? "demo-user";
  const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID ?? "pi-holo-001";

  const wirePayloadConfig = useMemo(
    () => ({
      lmStudioUrl: config.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL,
      llmModel: config.llmModel ?? DEFAULT_LLM_MODEL,
      whisperUrl: config.whisperUrl ?? DEFAULT_WHISPER_URL,
      whisperModel: config.whisperModel ?? DEFAULT_WHISPER_MODEL,
      whisperLanguage: config.whisperLanguage ?? DEFAULT_WHISPER_LANGUAGE,
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
      ttsEnabled: config.ttsEnabled ?? DEFAULT_TTS_ENABLED,
      ttsUrl: config.ttsUrl ?? DEFAULT_TTS_URL,
      ttsVoice: config.ttsVoice ?? DEFAULT_TTS_VOICE,
      ttsModel: config.ttsModel ?? DEFAULT_TTS_MODEL,
    }),
    [
      config.lmStudioUrl,
      config.llmModel,
      config.whisperUrl,
      config.whisperModel,
      config.whisperLanguage,
      config.systemPrompt,
      config.maxTurns,
      config.ttsEnabled,
      config.ttsUrl,
      config.ttsVoice,
      config.ttsModel,
    ],
  );
  const wirePayloadConfigRef = useRef(wirePayloadConfig);
  useEffect(() => {
    wirePayloadConfigRef.current = wirePayloadConfig;
  }, [wirePayloadConfig]);

  // Single socket connection scoped to the module's lifetime. The renderer
  // page already has its own socket for the generic module:display flow;
  // we open a dedicated one here just for AI events so we don't have to
  // pipe everything through `module:stream`.
  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL &&
      process.env.NEXT_PUBLIC_SOCKET_URL.length > 0
        ? process.env.NEXT_PUBLIC_SOCKET_URL
        : "http://localhost:3000";
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      url,
      { reconnection: true },
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      // Register as a renderer so the server adds us to user:${userId}
      // (where ai:* events are emitted) AND device:${deviceId}.
      socket.emit("client:register", {
        role: "renderer",
        deviceId,
        userId,
      });
    });

    socket.on("ai:state", (payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.requestId !== currentRequestIdRef.current) return;
      if (payload.state === "processing") {
        setUiState("processing");
      } else if (payload.state === "idle") {
        // server says it's done; the response handler already flipped us
        // into "speaking" — only fall back to idle here if no response
        // ever arrived.
        if (uiStateRef.current === "processing") setUiState("idle");
      }
    });

    socket.on("ai:transcript", (payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.requestId !== currentRequestIdRef.current) return;
      setTranscript(payload.text);
    });

    socket.on("ai:response", (payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.requestId !== currentRequestIdRef.current) return;
      setResponse(payload.text);
      setUiState("speaking");
    });

    socket.on("ai:error", (payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.requestId !== currentRequestIdRef.current) return;
      setErrorMsg(payload.message);
      setUiState("error");
    });

    // Desktop says the TTS audio actually finished playing — exit the
    // "speaking" UI now instead of waiting for the heuristic fallback
    // timer. Guard by requestId in case a stale event from an earlier
    // turn arrives after the user has started a new prompt.
    socket.on("ai:speech-end", (payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.requestId !== currentRequestIdRef.current) return;
      if (uiStateRef.current === "speaking") setUiState("idle");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, deviceId]);

  // Auto-return from speaking/error → idle. For `speaking` this is a
  // SAFETY NET only — the real signal is `ai:speech-end` from the
  // desktop. The fallback timer scales with response length so a long
  // answer doesn't vanish prematurely if the end event is ever missed.
  useEffect(() => {
    if (uiState !== "speaking" && uiState !== "error") return;
    const ms =
      uiState === "speaking"
        ? computeSpeakingTimeoutMs(response)
        : ERROR_TIMEOUT_MS;
    const id = window.setTimeout(() => {
      setUiState("idle");
      if (uiState === "error") setErrorMsg("");
    }, ms);
    return () => window.clearTimeout(id);
  }, [uiState, response]);

  // Live mic level while recording — drives the meter ring.
  useEffect(() => {
    if (uiState !== "recording") {
      setMicLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const r = recorderRef.current;
      setMicLevel(r ? r.getLevel() : 0);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [uiState]);

  // Push-to-talk control: capture-phase keydown so we beat the
  // page-level listener (which would otherwise re-emit Space/Enter as
  // `controller:input action=select` and cycle modules / cycle styles).
  useEffect(() => {
    async function startRecording() {
      try {
        if (!recorderRef.current) {
          recorderRef.current = new PushToTalkRecorder();
        }
        await recorderRef.current.start();
        currentRequestIdRef.current = randomId();
        setTranscript("");
        setResponse("");
        setErrorMsg("");
        setUiState("recording");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Microphone unavailable.";
        setErrorMsg(message);
        setUiState("error");
      }
    }

    async function stopAndSend() {
      const recorder = recorderRef.current;
      if (!recorder || !recorder.isRecording()) return;
      try {
        const result = await recorder.stop();
        const requestId = currentRequestIdRef.current;
        const socket = socketRef.current;
        if (!requestId || !socket || !socket.connected) {
          throw new Error("Not connected to the assistant server.");
        }
        setUiState("processing");
        socket.emit("ai:audio", {
          deviceId,
          userId,
          requestId,
          audio: result.audio,
          mime: result.mime,
          config: wirePayloadConfigRef.current,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send audio.";
        setErrorMsg(message);
        setUiState("error");
      }
    }

    function isTriggerKey(event: KeyboardEvent): boolean {
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      return (
        event.key === " " ||
        event.key === "Spacebar" ||
        event.key === "Enter"
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isTriggerKey(event)) return;
      // Always swallow the key so the page-level handler can't ALSO
      // interpret it as a "select" controller action while the AI
      // module is mounted.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      const state = uiStateRef.current;
      if (state === "recording") {
        stopAndSend();
      } else if (state === "idle" || state === "speaking" || state === "error") {
        // Cancel any "speaking" lingering UI and start a fresh prompt.
        startRecording();
      }
      // If we're in "processing", ignore — the request is in flight.
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [deviceId, userId]);

  // Recorder teardown on unmount.
  useEffect(() => {
    return () => {
      recorderRef.current?.dispose();
      recorderRef.current = null;
    };
  }, []);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <motion.div
        initial={false}
        animate={{ rotate: rotation, scaleX, scaleY }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <div className="flex w-[80vmin] flex-col items-center gap-6 text-center">
          {/*
           * Status indicator — the big visual cue. Each UI state paints
           * a different mic-frame so the user knows whether the system
           * is listening, thinking, or speaking from across the room.
           */}
          <StatusOrb
            state={uiState}
            accentColor={accentColor}
            level={micLevel}
          />

          {/*
           * Text block. AnimatePresence with mode="wait" so the
           * transcript→response handoff reads as one fade-through, not
           * two stacked elements.
           */}
          <AnimatePresence mode="wait">
            {uiState === "idle" ? (
              <motion.p
                key="idle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-[3vmin] uppercase tracking-[0.35em]"
                style={{ color: transcriptColor }}
              >
                Press center to talk
              </motion.p>
            ) : uiState === "recording" ? (
              <motion.p
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[3vmin] uppercase tracking-[0.35em]"
                style={{ color: accentColor }}
              >
                Listening…
              </motion.p>
            ) : uiState === "processing" ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                {transcript ? (
                  <p
                    className="text-[2.2vmin] italic"
                    style={{ color: transcriptColor }}
                  >
                    “{transcript}”
                  </p>
                ) : null}
                <p
                  className="text-[3vmin] uppercase tracking-[0.35em]"
                  style={{ color: accentColor }}
                >
                  Thinking…
                </p>
              </motion.div>
            ) : uiState === "speaking" ? (
              <motion.div
                key="speaking"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center gap-3"
              >
                {transcript ? (
                  <p
                    className="text-[2.2vmin] italic"
                    style={{ color: transcriptColor }}
                  >
                    “{transcript}”
                  </p>
                ) : null}
                <p
                  className="text-[4vmin] leading-snug"
                  style={{
                    color: responseColor,
                    textShadow: `0 0 30px ${responseColor}`,
                  }}
                >
                  {response}
                </p>
              </motion.div>
            ) : (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="max-w-[70vmin] text-[2.8vmin] text-red-400"
              >
                {errorMsg || "Something went wrong."}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function StatusOrb({
  state,
  accentColor,
  level,
}: {
  state: UiState;
  accentColor: string;
  level: number;
}) {
  // Size pulses with the live mic level while recording for a tangible
  // sense of "the hologram heard me". Clamped so even a loud burst
  // doesn't blow the layout.
  const scale =
    state === "recording" ? 1 + Math.min(0.5, level * 0.8) : 1;
  const borderColor = state === "error" ? "#f87171" : accentColor;

  return (
    <div className="relative flex h-[28vmin] w-[28vmin] items-center justify-center">
      {state === "recording" ? (
        <motion.div
          aria-hidden
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 60px ${accentColor}`, borderRadius: "50%" }}
        />
      ) : state === "speaking" ? (
        <motion.div
          aria-hidden
          animate={{ opacity: [0.15, 0.5, 0.15] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 60px ${accentColor}`, borderRadius: "50%" }}
        />
      ) : null}

      <motion.div
        initial={false}
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="flex h-full w-full items-center justify-center rounded-full border-2"
        style={{
          borderColor,
          background: `radial-gradient(circle, ${accentColor}22, transparent 70%)`,
        }}
      >
        {state === "processing" ? (
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            className="h-[10vmin] w-[10vmin] rounded-full border-4 border-transparent"
            style={{ borderTopColor: accentColor }}
          />
        ) : (
          <MicIcon
            color={
              state === "recording"
                ? "#f87171"
                : state === "error"
                  ? "#f87171"
                  : accentColor
            }
          />
        )}
      </motion.div>
    </div>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="55%"
      height="55%"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}
