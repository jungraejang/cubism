import { defineModule } from "../defineModule";
import { aiAssistantManifest } from "./manifest";
import {
  AiAssistantConfigSchema,
  type AiAssistantConfig,
} from "./config";
import { AiAssistantControls } from "./Controls";
import { AiAssistantRenderer } from "./Renderer";

export const aiAssistantModule = defineModule<AiAssistantConfig>({
  manifest: aiAssistantManifest,
  configSchema: AiAssistantConfigSchema,
  Controls: AiAssistantControls,
  Renderer: AiAssistantRenderer,
  // No `onPrimaryAction` here: Space/Enter is intercepted by the AI
  // Renderer's own capture-phase listener (push-to-talk start/stop).
  // If the user has the module mounted but the AI Renderer hasn't
  // mounted yet for some reason, the page-level "select" fallback
  // simply no-ops on this module.
});

export * from "./config";
