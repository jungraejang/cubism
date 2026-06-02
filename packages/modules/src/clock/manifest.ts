import type { ModuleManifest } from "../types";
import {
  DEFAULT_CIRCLE_COLOR,
  DEFAULT_DATE_COLOR,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_TEXT_COLOR,
  type ClockModuleConfig,
} from "./config";

export const clockManifest: ModuleManifest<ClockModuleConfig> = {
  id: "clock",
  name: "Clock",
  description:
    "Displays a holographic animated clock with customizable circle, time, and date colors.",
  version: "0.1.0",
  permissions: [],
  defaultConfig: {
    format: "12h",
    showSeconds: false,
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
    circleColor: DEFAULT_CIRCLE_COLOR,
    textColor: DEFAULT_TEXT_COLOR,
    dateColor: DEFAULT_DATE_COLOR,
  },
};
