import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@cubism/protocol";

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
  whisperUrl: process.env.CUBISM_WHISPER_URL ?? "http://127.0.0.1:8000/v1",
  whisperModel:
    process.env.CUBISM_WHISPER_MODEL ?? "Systran/faster-whisper-small.en",
  systemPrompt:
    process.env.CUBISM_AI_SYSTEM_PROMPT ??
    "You are a helpful AI assistant. Keep responses concise.",
  maxTurns: Number(process.env.CUBISM_AI_MAX_TURNS ?? 8),
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
        systemPrompt:
          payload.config?.systemPrompt || AI_DEFAULTS.systemPrompt,
        maxTurns: payload.config?.maxTurns || AI_DEFAULTS.maxTurns,
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

        const responseText = await chatCompletion({
          baseUrl: cfg.lmStudioUrl,
          model: cfg.llmModel,
          messages: messagesForApi,
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
        io.to(room).emit("ai:tts", {
          userId: payload.userId,
          requestId: payload.requestId,
          text: responseText,
        });
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
}): Promise<string> {
  const { audio, mime, whisperUrl, whisperModel } = opts;
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
 * LM Studio chat helper. Uses the standard OpenAI chat/completions
 * shape — works against LM Studio, llama.cpp's server, Ollama in
 * compat mode, vLLM, etc.
 */
async function chatCompletion(opts: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  const { baseUrl, model, messages } = opts;
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
