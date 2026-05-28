import type { ModuleManifest } from "../types";
import {
  DEFAULT_BG_COLOR,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_HTML,
  type TextModuleConfig,
} from "./config";

export const textManifest: ModuleManifest<TextModuleConfig> = {
  id: "text",
  name: "Text",
  description:
    "Rich text with emojis, GIFs, customizable color, and font size. Edit live in the panel; sanitized on the renderer.",
  version: "0.1.0",
  permissions: [],
  defaultConfig: {
    html: DEFAULT_TEXT_HTML,
    fontSize: "md",
    textColor: DEFAULT_TEXT_COLOR,
    bgColor: DEFAULT_BG_COLOR,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
  },
};
