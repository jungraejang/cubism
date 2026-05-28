import type { ModuleManifest } from "../types";
import {
  DEFAULT_CIRCLE_COLOR,
  DEFAULT_DATE_COLOR,
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
    showSeconds: true,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    circleColor: DEFAULT_CIRCLE_COLOR,
    textColor: DEFAULT_TEXT_COLOR,
    dateColor: DEFAULT_DATE_COLOR,
  },
};
