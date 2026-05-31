import type { ModuleManifest } from "../types";
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

export const aiAssistantManifest: ModuleManifest<AiAssistantConfig> = {
  id: "ai-assistant",
  name: "AI Assistant",
  description:
    "Push-to-talk voice assistant. Press Space (or the center macropad key) to record, " +
    "press again to stop. Transcribed by Whisper, answered by LM Studio, " +
    "spoken back through the desktop speakers.",
  version: "0.1.0",
  permissions: ["microphone", "network"],
  defaultConfig: {
    lmStudioUrl: DEFAULT_LM_STUDIO_URL,
    llmModel: DEFAULT_LLM_MODEL,
    whisperUrl: DEFAULT_WHISPER_URL,
    whisperModel: DEFAULT_WHISPER_MODEL,
    whisperLanguage: DEFAULT_WHISPER_LANGUAGE,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    maxTurns: DEFAULT_MAX_TURNS,
    ttsEnabled: DEFAULT_TTS_ENABLED,
    ttsUrl: DEFAULT_TTS_URL,
    ttsVoice: DEFAULT_TTS_VOICE,
    ttsModel: DEFAULT_TTS_MODEL,
    accentColor: DEFAULT_ACCENT_COLOR,
    transcriptColor: DEFAULT_TRANSCRIPT_COLOR,
    responseColor: DEFAULT_RESPONSE_COLOR,
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
