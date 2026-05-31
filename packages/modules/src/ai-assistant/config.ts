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
  /**
   * Whisper model identifier. Default ships the multilingual `small`
   * weights so non-English speech (Korean, Japanese, Spanish, …) is
   * transcribed correctly out of the box. Swap to a `*.en` variant
   * if you only ever speak English and want the slightly higher
   * English-only accuracy / smaller model.
   */
  whisperModel: z.string().optional(),
  /**
   * Optional ISO 639-1 language code passed to Whisper (`ko`, `en`,
   * `ja`, `es`, `de`, etc.). When set, Whisper skips its language
   * detection step — faster and noticeably more accurate on short
   * clips. Leave empty for auto-detect.
   */
  whisperLanguage: z.string().optional(),
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
  /**
   * Toggle Piper/OpenAI TTS on the server. When off the desktop falls
   * back to the browser's built-in `speechSynthesis` voice — handy if
   * the TTS container is down or you want zero-setup mode.
   */
  ttsEnabled: z.boolean().optional(),
  /**
   * Base URL of an OpenAI-compatible TTS endpoint (`/v1/audio/speech`).
   * Default points at OpenedAI Speech (https://github.com/matatonic/openedai-speech)
   * which wraps Piper voices.
   */
  ttsUrl: z.string().url().optional(),
  /**
   * Voice name. With OpenedAI Speech this is either an OpenAI alias
   * (`alloy`/`echo`/`fable`/`onyx`/`nova`/`shimmer`) or a Piper voice
   * id (`en_US-amy-medium`, etc.) depending on the image you run.
   */
  ttsVoice: z.string().optional(),
  /** Model identifier passed to `/v1/audio/speech`. */
  ttsModel: z.string().optional(),
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
/**
 * Empty by default so the desktop server's `CUBISM_LLM_MODEL` env var
 * is the source of truth when the user hasn't picked a model in the
 * Controls panel. LM Studio's `/api/v1/chat` (MCP path) rejects
 * unknown identifiers, so a placeholder like "local-model" would
 * actively break things — better to defer to env until the user types
 * a real value.
 */
export const DEFAULT_LLM_MODEL = "";
export const DEFAULT_WHISPER_URL = "http://127.0.0.1:8000/v1";
export const DEFAULT_WHISPER_MODEL = "Systran/faster-whisper-small";
/** Empty string = auto-detect language on every clip. */
export const DEFAULT_WHISPER_LANGUAGE = "";
export const DEFAULT_SYSTEM_PROMPT =
  "You are a friendly AI assistant displayed on a small holographic " +
  "projector. Keep responses concise — one to three short sentences. " +
  "Avoid markdown, lists, and code blocks. Speak naturally as if " +
  "answering aloud.";
export const DEFAULT_MAX_TURNS = 8;
export const DEFAULT_TTS_ENABLED = true;
export const DEFAULT_TTS_URL = "http://127.0.0.1:8001/v1";
export const DEFAULT_TTS_VOICE = "nova";
export const DEFAULT_TTS_MODEL = "tts-1";
export const DEFAULT_ACCENT_COLOR = "#22d3ee";
export const DEFAULT_TRANSCRIPT_COLOR = "#94a3b8";
export const DEFAULT_RESPONSE_COLOR = "#f0fdfa";
