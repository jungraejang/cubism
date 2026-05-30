import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

/**
 * AI Assistant module — push-to-talk voice agent.
 *
 * Flow: Pi captures audio via MediaRecorder → server forwards the blob to a
 * Whisper-compatible STT endpoint → resulting transcript is piped into LM
 * Studio's chat/completions API → response is displayed on the hologram and
 * spoken aloud by the desktop browser's TTS.
 *
 * The Whisper service is intentionally separate from LM Studio because LM
 * Studio doesn't currently expose `/v1/audio/transcriptions`. Recommended
 * companion: `faster-whisper-server` (single Docker container, OpenAI-compat).
 */
export const AiAssistantConfigSchema = z.object({
  /**
   * Base URL of the LM Studio (or any OpenAI-compatible chat) endpoint.
   * Must include the `/v1` suffix; the server appends `/chat/completions`.
   */
  lmStudioUrl: z.string().url().optional(),
  /**
   * Model name passed to LM Studio's chat/completions endpoint. LM Studio
   * accepts any string here when there's exactly one loaded model — it
   * ignores the field and uses the loaded one — but a meaningful name
   * helps when multiple models are loaded.
   */
  llmModel: z.string().optional(),
  /**
   * Base URL of the Whisper-compatible STT endpoint. Must include `/v1`;
   * the server appends `/audio/transcriptions`.
   */
  whisperUrl: z.string().url().optional(),
  /** Whisper model identifier (e.g. `Systran/faster-whisper-small.en`). */
  whisperModel: z.string().optional(),
  /**
   * System prompt prepended to every conversation. Keep it short so the
   * assistant returns brief, on-screen-friendly replies — the hologram
   * doesn't scroll well.
   */
  systemPrompt: z.string().optional(),
  /**
   * Maximum conversation turns retained on the server. One "turn" is a
   * user message + assistant reply. The server trims the oldest turns
   * past this cap on every request so the LLM context stays bounded.
   */
  maxTurns: z.number().int().min(1).max(32).optional(),
  /** Hex color (e.g. `#22d3ee`) for accents — status badge, mic ring. */
  accentColor: z.string().optional(),
  /** Hex color for the user's transcribed text (shown small/dim). */
  transcriptColor: z.string().optional(),
  /** Hex color for the assistant's response (shown large/bright). */
  responseColor: z.string().optional(),
  ...OrientationFields,
});

export type AiAssistantConfig = z.infer<typeof AiAssistantConfigSchema>;

export const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234/v1";
export const DEFAULT_LLM_MODEL = "local-model";
export const DEFAULT_WHISPER_URL = "http://127.0.0.1:8000/v1";
export const DEFAULT_WHISPER_MODEL = "Systran/faster-whisper-small.en";
export const DEFAULT_SYSTEM_PROMPT =
  "You are a friendly AI assistant displayed on a small holographic " +
  "projector. Keep responses concise — one to three short sentences. " +
  "Avoid markdown, lists, and code blocks. Speak naturally as if " +
  "answering aloud.";
export const DEFAULT_MAX_TURNS = 8;
export const DEFAULT_ACCENT_COLOR = "#22d3ee";
export const DEFAULT_TRANSCRIPT_COLOR = "#94a3b8";
export const DEFAULT_RESPONSE_COLOR = "#f0fdfa";
