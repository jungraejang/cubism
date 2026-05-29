import type { ModuleManifest } from "../types";
import {
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_STYLE,
  type VisualizerModuleConfig,
} from "./config";

export const visualizerManifest: ModuleManifest<VisualizerModuleConfig> = {
  id: "visualizer",
  name: "Visualizer",
  description:
    "Real-time audio visualizer with oscilloscope, radial-spectrum, concentric-rings, and stacked-waves styles. Each visual stores its own settings.",
  version: "0.3.0",
  permissions: ["microphone"],
  defaultConfig: {
    style: DEFAULT_STYLE,
    /*
     * Each style ships with its own factory defaults (see `STYLE_DEFAULTS`
     * in config.ts). We intentionally leave `styleSettings` undefined and
     * skip the legacy flat fields so `resolveStyleSettings` returns the
     * pristine per-style defaults on first load — no cross-style bleed.
     */
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    preferredSource: "display",
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
