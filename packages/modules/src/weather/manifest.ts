import type { ModuleManifest } from "../types";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DETAIL_COLOR,
  DEFAULT_TEXT_COLOR,
  DEFAULT_ZIP_CODE,
  type WeatherModuleConfig,
} from "./config";

export const weatherManifest: ModuleManifest<WeatherModuleConfig> = {
  id: "weather",
  name: "Weather",
  description:
    "Live weather for a US ZIP code. Fetches from free APIs (no signup) on the hologram display.",
  version: "0.1.0",
  permissions: ["network"],
  defaultConfig: {
    zipCode: DEFAULT_ZIP_CODE,
    accentColor: DEFAULT_ACCENT_COLOR,
    textColor: DEFAULT_TEXT_COLOR,
    detailColor: DEFAULT_DETAIL_COLOR,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
  },
};
