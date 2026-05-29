import type { ModuleManifest } from "../types";
import {
  DEFAULT_BAR_COUNT,
  DEFAULT_GLOW_COLOR,
  DEFAULT_GRID_COLOR,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_RING_COUNT,
  DEFAULT_RING_SPEED,
  DEFAULT_SENSITIVITY,
  DEFAULT_STYLE,
  type VisualizerModuleConfig,
} from "./config";

export const visualizerManifest: ModuleManifest<VisualizerModuleConfig> = {
  id: "visualizer",
  name: "Visualizer",
  description:
    "Real-time audio visualizer with oscilloscope and radial-spectrum styles. Start capture from the control panel.",
  version: "0.2.0",
  permissions: ["microphone"],
  defaultConfig: {
    style: DEFAULT_STYLE,
    lineColor: DEFAULT_LINE_COLOR,
    glowColor: DEFAULT_GLOW_COLOR,
    gridColor: DEFAULT_GRID_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
    sensitivity: DEFAULT_SENSITIVITY,
    showGrid: true,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    preferredSource: "display",
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
