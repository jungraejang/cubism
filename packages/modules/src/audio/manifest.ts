import type { ModuleManifest } from "../types";
import {
  DEFAULT_GLOW_COLOR,
  DEFAULT_GRID_COLOR,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_SENSITIVITY,
  type AudioModuleConfig,
} from "./config";

export const audioManifest: ModuleManifest<AudioModuleConfig> = {
  id: "audio",
  name: "Audio",
  description:
    "Oscilloscope-style waveform of your desktop's audio (system, tab, or mic). Start capture from the control panel.",
  version: "0.1.0",
  permissions: ["microphone"],
  defaultConfig: {
    lineColor: DEFAULT_LINE_COLOR,
    glowColor: DEFAULT_GLOW_COLOR,
    gridColor: DEFAULT_GRID_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
    sensitivity: DEFAULT_SENSITIVITY,
    showGrid: true,
    preferredSource: "display",
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
