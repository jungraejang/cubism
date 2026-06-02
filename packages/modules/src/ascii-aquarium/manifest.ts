import type { ModuleManifest } from "../types";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_BUBBLE_RATE,
  DEFAULT_FISH_COLOR,
  DEFAULT_FISH_COUNT,
  DEFAULT_SEAWEED_COLOR,
  DEFAULT_SEAWEED_COUNT,
  DEFAULT_STYLE,
  type AsciiAquariumConfig,
} from "./config";

export const asciiAquariumManifest: ModuleManifest<AsciiAquariumConfig> = {
  id: "ascii-aquarium",
  name: "Aquarium",
  description:
    "A tiny aquarium with fish that swim at random, swaying seaweed, and rising bubbles. Choose between 8-bit pixel-art sprites or classic ASCII glyph art.",
  version: "0.2.0",
  permissions: [],
  defaultConfig: {
    style: DEFAULT_STYLE,
    fishCount: DEFAULT_FISH_COUNT,
    seaweedCount: DEFAULT_SEAWEED_COUNT,
    bubbleRate: DEFAULT_BUBBLE_RATE,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    fishColor: DEFAULT_FISH_COLOR,
    seaweedColor: DEFAULT_SEAWEED_COLOR,
    bubbleColor: DEFAULT_BUBBLE_COLOR,
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
