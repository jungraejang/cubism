import type { ModuleManifest } from "../types";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_BUBBLE_RATE,
  DEFAULT_FISH_COLOR,
  DEFAULT_FISH_COUNT,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_SEAWEED_COLOR,
  DEFAULT_SEAWEED_COUNT,
  type AsciiAquariumConfig,
} from "./config";

export const asciiAquariumManifest: ModuleManifest<AsciiAquariumConfig> = {
  id: "ascii-aquarium",
  name: "ASCII Aquarium",
  description:
    "A tiny 3D aquarium rendered entirely in ASCII. Fish swim at random, seaweed sways, bubbles rise — each layer parallaxed at a different Z depth for a holographic feel.",
  version: "0.1.0",
  permissions: [],
  defaultConfig: {
    fishCount: DEFAULT_FISH_COUNT,
    seaweedCount: DEFAULT_SEAWEED_COUNT,
    bubbleRate: DEFAULT_BUBBLE_RATE,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    fishColor: DEFAULT_FISH_COLOR,
    seaweedColor: DEFAULT_SEAWEED_COLOR,
    bubbleColor: DEFAULT_BUBBLE_COLOR,
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
