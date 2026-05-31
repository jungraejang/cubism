import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@cubism/protocol";

/**
 * Load `.env.local` / `.env` BEFORE any `process.env.X` read happens
 * below. `next dev` does this automatically, but we run via
 * `tsx watch server.ts` — a custom Node entrypoint that doesn't.
 *
 * Without this call, module-level constants like `AI_DEFAULTS` see
 * empty strings for everything in `.env.local` because `next` only
 * loads env vars during `app.prepare()`, which runs AFTER those
 * constants have already been frozen. Symptom: AI features that
 * depend on `LM_STUDIO_API_KEY` etc. silently fall back to their
 * hardcoded defaults.
 */
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

/**
 * AI Assistant orchestration — server-side defaults (overridable per
 * request via the payload from the AI module's Controls). Kept here
 * rather than in the module package because the server is the only
 * place we actually need them; the client always sends explicit values
 * resolved from its own defaults, but a missing field shouldn't crash
 * the pipeline.
 */
const AI_DEFAULTS = {
  lmStudioUrl: process.env.CUBISM_LMSTUDIO_URL ?? "http://127.0.0.1:1234/v1",
  llmModel: process.env.CUBISM_LLM_MODEL ?? "local-model",
  /**
   * Bearer token sent on every LM Studio request when set. Required
   * once LM Studio's local server has auth enabled (Settings → Local
   * Server → Authentication). Kept server-side only — the desktop
   * browser never sees it. Empty string disables the header so
   * un-authed setups keep working.
   */
  lmStudioApiKey: process.env.LM_STUDIO_API_KEY ?? "",
  /**
   * Comma-separated list of MCP integrations to enable on every
   * LLM call. When set, the AI pipeline switches from the
   * OpenAI-compatible `/v1/chat/completions` endpoint (which has no
   * MCP support) to LM Studio's own `/api/v1/chat` Responses-style
   * endpoint, which orchestrates MCP tools server-side and returns
   * the final answer after running them.
   *
   * Values are plugin ids from your `mcp.json` (e.g. `mcp/brave-search`,
   * `mcp/fetch`, `mcp/playwright`). Requires the "Allow calling servers
   * from mcp.json" toggle in LM Studio's Server Settings.
   *
   * Empty list = stay on the portable OpenAI-compat endpoint (no MCP).
   */
  lmStudioIntegrations: (process.env.CUBISM_LM_INTEGRATIONS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  whisperUrl: process.env.CUBISM_WHISPER_URL ?? "http://127.0.0.1:8000/v1",
  whisperModel:
    process.env.CUBISM_WHISPER_MODEL ?? "Systran/faster-whisper-small",
  /**
   * Optional ISO 639-1 language hint for Whisper. Empty = auto-detect
   * (Whisper picks from its 99 supported languages every clip).
   * Setting e.g. `ko` makes Korean transcription faster and more
   * accurate, especially for short utterances where auto-detect can
   * confuse Korean with Japanese.
   */
  whisperLanguage: process.env.CUBISM_WHISPER_LANGUAGE ?? "",
  systemPrompt:
    process.env.CUBISM_AI_SYSTEM_PROMPT ??
    "You are a helpful AI assistant. Keep responses concise.",
  maxTurns: Number(process.env.CUBISM_AI_MAX_TURNS ?? 8),
  /**
   * TTS — defaults to OpenedAI Speech (Piper underneath) on port 8001.
   * `enabled=false` (or a TTS outage) falls back to the desktop
   * browser's built-in `speechSynthesis` voice.
   */
  ttsEnabled: process.env.CUBISM_TTS_ENABLED !== "false",
  ttsUrl: process.env.CUBISM_TTS_URL ?? "http://127.0.0.1:8001/v1",
  ttsVoice: process.env.CUBISM_TTS_VOICE ?? "nova",
  ttsModel: process.env.CUBISM_TTS_MODEL ?? "tts-1",
} as const;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * In-memory conversation history per user. Cleared on `ai:reset` and
 * trimmed to `maxTurns * 2` user/assistant messages on every append so
 * the LLM context can't grow unbounded. Process-local — a server
 * restart wipes everything, which is fine for an MVP demo and avoids a
 * persistence layer.
 */
const aiHistory = new Map<string, ChatMessage[]>();

function trimHistory(messages: ChatMessage[], maxTurns: number): ChatMessage[] {
  // Keep the last `maxTurns` user+assistant pairs. Any system message
  // is added fresh on each request, so we don't need to retain one.
  const keep = Math.max(2, maxTurns * 2);
  return messages.slice(-keep);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// In dev (or when ALLOWED_ORIGINS is empty) reflect the request origin so
// the renderer running on :3001 and any LAN device can connect during setup.
const corsOrigin: string[] | true =
  allowedOrigins.length > 0 ? allowedOrigins : true;

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("[socket] connected:", socket.id);

    socket.on("client:register", (payload) => {
      socket.data.role = payload.role;
      socket.data.deviceId = payload.deviceId;
      socket.data.userId = payload.userId;

      if (payload.role === "renderer" && payload.deviceId) {
        socket.join(`device:${payload.deviceId}`);
        // Also join the user room so the renderer can emit
        // `controller:input` (e.g. from a Pi-side keyboard) and have the
        // server fan it back out to the desktop control panel.
        if (payload.userId) {
          socket.join(`user:${payload.userId}`);
        }

        io.emit("device:status", {
          deviceId: payload.deviceId,
          status: "online",
          lastSeenAt: new Date().toISOString(),
        });

        console.log(`[socket] renderer registered: ${payload.deviceId}`);
      }

      if (payload.role === "desktop" && payload.userId) {
        socket.join(`user:${payload.userId}`);
        // Separate room used by AI `ai:tts` so playback fans out only to
        // sockets that actually have speakers and a `<audio>` handler.
        // Without this, the renderer (Pi has no speakers) and the
        // Controls' status-sidecar socket would also receive `ai:tts`
        // and could trigger duplicate playback paths if any of them
        // ever grew a handler. Belt-and-braces.
        socket.join(`desktop:${payload.userId}`);
        console.log(`[socket] desktop registered for user: ${payload.userId}`);
      }

      if (payload.role === "controller" && payload.userId) {
        socket.join(`user:${payload.userId}`);
        console.log(
          `[socket] controller registered for user: ${payload.userId}`,
        );
      }
    });

    socket.on("device:heartbeat", (payload) => {
      io.emit("device:status", {
        deviceId: payload.deviceId,
        status: "online",
        lastSeenAt: payload.timestamp,
      });
    });

    socket.on("module:send-to-device", (payload) => {
      console.log("[socket] module command:", payload);

      io.to(`device:${payload.deviceId}`).emit("module:display", {
        commandId: payload.commandId,
        moduleId: payload.moduleId,
        config: payload.config,
      });

      io.emit("command:ack", {
        commandId: payload.commandId,
        deviceId: payload.deviceId,
        status: "received",
      });
    });

    /**
     * Realtime stream relay. Intentionally not logged - this fires many
     * times per second (e.g. audio waveform frames at 30+ fps).
     */
    socket.on("module:stream-to-device", (payload) => {
      io.to(`device:${payload.deviceId}`).emit("module:stream", {
        moduleId: payload.moduleId,
        deviceId: payload.deviceId,
        data: payload.data,
      });
    });

    /**
     * Pi-side hardware controller input (volume knob). Relayed to every
     * desktop control panel registered to the same user so the UI can
     * advance the selected module. Filters by deviceId on the client.
     */
    socket.on("controller:input", (payload) => {
      const userId = socket.data.userId;
      if (!userId) {
        console.warn(
          "[socket] controller:input from unregistered client, dropping",
        );
        return;
      }
      io.to(`user:${userId}`).emit("controller:input", payload);
    });

    /**
     * AI Assistant pipeline. Triggered by the Pi-side push-to-talk
     * recorder finishing a clip. We:
     *   1. POST the audio blob to a Whisper-compatible endpoint.
     *   2. Emit `ai:transcript` so the Pi can render what the user said.
     *   3. Append to the per-user conversation history (capped).
     *   4. POST the history to LM Studio's chat/completions endpoint.
     *   5. Emit `ai:response` (Pi display) and `ai:tts` (desktop
     *      speakers) for the assistant reply.
     *
     * Any failure → `ai:error` + leave the conversation history
     * unchanged (a failed turn shouldn't pollute future context).
     */
    socket.on("ai:audio", async (payload) => {
      const room = `user:${payload.userId}`;
      const cfg = {
        lmStudioUrl: payload.config?.lmStudioUrl || AI_DEFAULTS.lmStudioUrl,
        llmModel: payload.config?.llmModel || AI_DEFAULTS.llmModel,
        whisperUrl: payload.config?.whisperUrl || AI_DEFAULTS.whisperUrl,
        whisperModel:
          payload.config?.whisperModel || AI_DEFAULTS.whisperModel,
        // Empty string is a meaningful value here ("auto-detect"), so
        // use a nullish fallback instead of `||`.
        whisperLanguage:
          payload.config?.whisperLanguage ?? AI_DEFAULTS.whisperLanguage,
        systemPrompt:
          payload.config?.systemPrompt || AI_DEFAULTS.systemPrompt,
        maxTurns: payload.config?.maxTurns || AI_DEFAULTS.maxTurns,
        // `ttsEnabled` is a boolean so the truthy/`||` shortcut would
        // ignore an explicit `false` from the client; check for
        // undefined instead.
        ttsEnabled:
          payload.config?.ttsEnabled === undefined
            ? AI_DEFAULTS.ttsEnabled
            : payload.config.ttsEnabled,
        ttsUrl: payload.config?.ttsUrl || AI_DEFAULTS.ttsUrl,
        ttsVoice: payload.config?.ttsVoice || AI_DEFAULTS.ttsVoice,
        ttsModel: payload.config?.ttsModel || AI_DEFAULTS.ttsModel,
      };

      io.to(room).emit("ai:state", {
        deviceId: payload.deviceId,
        userId: payload.userId,
        requestId: payload.requestId,
        state: "processing",
      });

      try {
        const transcript = await transcribeAudio({
          audio: payload.audio,
          mime: payload.mime,
          whisperUrl: cfg.whisperUrl,
          whisperModel: cfg.whisperModel,
          whisperLanguage: cfg.whisperLanguage,
        });

        if (!transcript.trim()) {
          // Whisper sometimes returns an empty string for silence /
          // sub-second clips. Surface a friendly hint and skip the LLM
          // call rather than feeding the model an empty user turn.
          io.to(room).emit("ai:error", {
            deviceId: payload.deviceId,
            userId: payload.userId,
            requestId: payload.requestId,
            message: "Didn't catch that — try again.",
          });
          io.to(room).emit("ai:state", {
            deviceId: payload.deviceId,
            userId: payload.userId,
            requestId: payload.requestId,
            state: "idle",
          });
          return;
        }

        io.to(room).emit("ai:transcript", {
          deviceId: payload.deviceId,
          userId: payload.userId,
          requestId: payload.requestId,
          text: transcript,
        });

        const prior = aiHistory.get(payload.userId) ?? [];
        const messagesForApi: ChatMessage[] = [
          { role: "system", content: cfg.systemPrompt },
          ...prior,
          { role: "user", content: transcript },
        ];

        const responseText =
          AI_DEFAULTS.lmStudioIntegrations.length > 0
            ? await chatWithIntegrations({
                baseUrl: cfg.lmStudioUrl,
                model: cfg.llmModel,
                messages: messagesForApi,
                apiKey: AI_DEFAULTS.lmStudioApiKey,
                integrations: AI_DEFAULTS.lmStudioIntegrations,
              })
            : await chatCompletion({
                baseUrl: cfg.lmStudioUrl,
                model: cfg.llmModel,
                messages: messagesForApi,
                apiKey: AI_DEFAULTS.lmStudioApiKey,
              });

        const trimmed = trimHistory(
          [
            ...prior,
            { role: "user", content: transcript },
            { role: "assistant", content: responseText },
          ],
          cfg.maxTurns,
        );
        aiHistory.set(payload.userId, trimmed);

        io.to(room).emit("ai:response", {
          deviceId: payload.deviceId,
          userId: payload.userId,
          requestId: payload.requestId,
          text: responseText,
        });

        /**
         * Try to render server-side TTS so the desktop can play a
         * neural voice instead of the browser's flat default. A
         * failure here is non-fatal — we still emit `ai:tts` with
         * just the text so the desktop's `speechSynthesis` fallback
         * kicks in.
         */
        let ttsAudio: Buffer | null = null;
        let ttsMime: string | null = null;
        if (cfg.ttsEnabled) {
          try {
            const result = await synthesizeSpeech({
              baseUrl: cfg.ttsUrl,
              model: cfg.ttsModel,
              voice: cfg.ttsVoice,
              input: responseText,
            });
            ttsAudio = result.audio;
            ttsMime = result.mime;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[ai] TTS failed (falling back to browser speech): ${msg}`,
            );
          }
        }

        // Scope TTS playback to the desktop-only room. Renderers and
        // the Controls status sidecar don't play audio; emitting there
        // would just be wasted binary traffic (or, worse, a duplicate
        // play handler we forgot about later).
        const desktopRoom = `desktop:${payload.userId}`;
        if (ttsAudio && ttsMime) {
          io.to(desktopRoom).emit("ai:tts", {
            userId: payload.userId,
            requestId: payload.requestId,
            text: responseText,
            audio: ttsAudio,
            mime: ttsMime,
          });
        } else {
          io.to(desktopRoom).emit("ai:tts", {
            userId: payload.userId,
            requestId: payload.requestId,
            text: responseText,
          });
        }
        io.to(room).emit("ai:state", {
          deviceId: payload.deviceId,
          userId: payload.userId,
          requestId: payload.requestId,
          state: "idle",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[ai] pipeline error:", message);
        io.to(room).emit("ai:error", {
          deviceId: payload.deviceId,
          userId: payload.userId,
          requestId: payload.requestId,
          message,
        });
        io.to(room).emit("ai:state", {
          deviceId: payload.deviceId,
          userId: payload.userId,
          requestId: payload.requestId,
          state: "error",
        });
      }
    });

    socket.on("ai:reset", (payload) => {
      aiHistory.delete(payload.userId);
      console.log(`[ai] history cleared for user: ${payload.userId}`);
    });

    /**
     * Relay the desktop's "TTS playback finished" notification to the
     * user's room so the renderer can drop its `speaking` UI exactly
     * when the audio actually ends. We re-emit the same event name on
     * the server-to-client side; renderers filter by `deviceId`.
     */
    socket.on("ai:speech-end", (payload) => {
      const room = `user:${payload.userId}`;
      io.to(room).emit("ai:speech-end", payload);
    });

    socket.on("disconnect", () => {
      console.log("[socket] disconnected:", socket.id);

      if (socket.data.role === "renderer" && socket.data.deviceId) {
        io.emit("device:status", {
          deviceId: socket.data.deviceId,
          status: "offline",
          lastSeenAt: new Date().toISOString(),
        });
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Cubism desktop + socket bridge ready on http://${hostname}:${port}`,
    );
    // Sanity-check banner for the AI Assistant integrations. We log
    // presence/absence rather than the actual values so secrets never
    // hit the console — this is the fastest way to catch the classic
    // "I added it to .env.local but didn't restart" footgun.
    console.log(
      `[ai] LM Studio: ${AI_DEFAULTS.lmStudioUrl}` +
        ` | model=${AI_DEFAULTS.llmModel}` +
        ` | auth=${AI_DEFAULTS.lmStudioApiKey ? "yes" : "no"}` +
        ` | mcp=${
          AI_DEFAULTS.lmStudioIntegrations.length > 0
            ? AI_DEFAULTS.lmStudioIntegrations.join(",")
            : "off"
        }`,
    );
    console.log(
      `[ai] Whisper:   ${AI_DEFAULTS.whisperUrl}` +
        ` | model=${AI_DEFAULTS.whisperModel}` +
        ` | lang=${AI_DEFAULTS.whisperLanguage || "auto"}`,
    );
    console.log(
      `[ai] TTS:       ${AI_DEFAULTS.ttsUrl}` +
        ` | voice=${AI_DEFAULTS.ttsVoice}` +
        ` | enabled=${AI_DEFAULTS.ttsEnabled ? "yes" : "no"}`,
    );
  });
}

/**
 * Whisper STT helper. Hits any OpenAI-compatible `/audio/transcriptions`
 * endpoint (faster-whisper-server, LocalAI, whisper.cpp's server, etc.).
 *
 * Accepts either ArrayBuffer or a Node Buffer / Uint8Array because the
 * Socket.IO binary transport delivers a Buffer on the server side even
 * when the client originally emitted an ArrayBuffer.
 */
async function transcribeAudio(opts: {
  audio: ArrayBuffer | Uint8Array;
  mime: string;
  whisperUrl: string;
  whisperModel: string;
  whisperLanguage: string;
}): Promise<string> {
  const { audio, mime, whisperUrl, whisperModel, whisperLanguage } = opts;
  const bytes =
    audio instanceof Uint8Array
      ? audio
      : new Uint8Array(audio as ArrayBuffer);
  // Use the bytes' underlying buffer directly — Blob accepts ArrayBufferView
  // (Uint8Array) but TS BlobPart inference is happier with a fresh
  // ArrayBuffer slice.
  const slice = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([slice], { type: mime || "audio/webm" });
  const ext = (() => {
    if (!mime) return "webm";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("wav")) return "wav";
    return "webm";
  })();

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model", whisperModel);
  // `response_format=text` keeps the response a plain string instead of
  // the verbose JSON shape — easier to parse and works on every
  // OpenAI-compatible Whisper server I've tested.
  form.append("response_format", "text");
  // Skip Whisper's language detection step when the user has
  // explicitly told us which language they're speaking. Faster and
  // noticeably more accurate on short clips.
  if (whisperLanguage) {
    form.append("language", whisperLanguage);
  }

  const url = whisperUrl.replace(/\/$/, "") + "/audio/transcriptions";
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whisper STT failed: HTTP ${res.status} ${body}`.trim());
  }
  const text = await res.text();
  // Some servers (LocalAI) still wrap text responses in JSON even when
  // asked for `response_format=text`. Tolerate both.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "text" in parsed) {
      return String((parsed as { text: unknown }).text ?? "").trim();
    }
  } catch {
    /* not JSON — fall through */
  }
  return text.trim();
}

/**
 * Server-side TTS helper. Calls an OpenAI-compatible `/v1/audio/speech`
 * endpoint and returns the raw audio bytes + mime type. Designed for
 * OpenedAI Speech (Piper underneath) but works with anything that
 * speaks the OpenAI TTS shape — drop-in upgrade path to OpenAI's
 * `tts-1-hd` or ElevenLabs proxies.
 *
 * `response_format=mp3` is a small, broadly-supported format every
 * browser's HTMLAudioElement can decode without extra glue. Piper
 * defaults to WAV which is several times larger over the socket and
 * a touch slower to start playback.
 */
async function synthesizeSpeech(opts: {
  baseUrl: string;
  model: string;
  voice: string;
  input: string;
}): Promise<{ audio: Buffer; mime: string }> {
  const { baseUrl, model, voice, input } = opts;
  const url = baseUrl.replace(/\/$/, "") + "/audio/speech";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      voice,
      input,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS call failed: HTTP ${res.status} ${body}`.trim());
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "audio/mpeg";
  return { audio: buf, mime };
}

/**
 * LM Studio chat helper. Uses the standard OpenAI chat/completions
 * shape — works against LM Studio, llama.cpp's server, Ollama in
 * compat mode, vLLM, etc.
 */
async function chatCompletion(opts: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  /** Bearer token. Optional — empty/undefined skips the header. */
  apiKey?: string;
}): Promise<string> {
  const { baseUrl, model, messages, apiKey } = opts;
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      // Slightly lower temp than OpenAI's default — concise, less
      // wandering responses tend to read better on the hologram.
      temperature: 0.6,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM call failed: HTTP ${res.status} ${body}`.trim());
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return text.trim();
}

/**
 * LM Studio's Responses-style chat API with MCP integrations enabled.
 *
 * Different from `/v1/chat/completions` in three ways:
 *  1. Endpoint is `<root>/api/v1/chat` (no `/v1/` after root).
 *  2. Body uses `input` (string or array) + `integrations` (string array
 *     of plugin ids from mcp.json) instead of the OpenAI shape.
 *  3. Response is a flat `output` array of mixed items (`reasoning`,
 *     `message`, `tool_call`) describing each step LM Studio took
 *     while orchestrating the MCP tools. The final user-facing reply
 *     is the LAST `{type: "message"}` item.
 *
 * We collapse our conversation history into a chat-style transcript
 * string so the request still includes prior turns. This is the
 * lowest-common-denominator format that works whether or not the
 * model has a native chat template — the system prompt rides on the
 * front so the model sees its constraints first.
 *
 * Docs: https://lmstudio.ai/docs/developer/core/mcp
 */
async function chatWithIntegrations(opts: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  integrations: string[];
  apiKey?: string;
}): Promise<string> {
  const { baseUrl, model, messages, integrations, apiKey } = opts;

  // Strip the trailing `/v1` from `baseUrl` so the LM Studio root
  // (`http://127.0.0.1:1234`) can have `/api/v1/chat` appended. If
  // the caller already removed it, the regex is a no-op.
  const root = baseUrl.replace(/\/v1\/?$/, "");
  const url = root + "/api/v1/chat";

  // Build a single-string `input` that includes the full history.
  // System message becomes a top-of-prompt instruction; user /
  // assistant turns are role-labelled so the model can distinguish
  // them. The trailing "Assistant:" cue nudges the model to continue.
  const systemMsg = messages.find((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system");
  const transcript = turns
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  const input = systemMsg
    ? `${systemMsg.content}\n\n${transcript}\n\nAssistant:`
    : `${transcript}\n\nAssistant:`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input,
      integrations,
      // 8 k matches the LM Studio docs example; bump if you run a
      // long-context model and want more conversation memory.
      context_length: 8000,
      temperature: 0.6,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `LM Studio integrations call failed: HTTP ${res.status} ${body}`.trim(),
    );
  }
  const data = (await res.json()) as {
    output?: Array<{ type: string; content?: string }>;
  };
  // Pick the LAST message item — earlier ones may be intermediate
  // "I'm going to search for X" thoughts the model produced before
  // the tool call returned. The user only cares about the final
  // synthesised answer.
  const messageItems = (data.output ?? []).filter(
    (o) => o.type === "message" && typeof o.content === "string",
  );
  const final = messageItems[messageItems.length - 1]?.content ?? "";
  return final.trim();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
