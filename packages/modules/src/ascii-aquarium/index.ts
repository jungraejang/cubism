import { defineModule } from "../defineModule";
import { asciiAquariumManifest } from "./manifest";
import {
  AQUARIUM_STYLES,
  AsciiAquariumConfigSchema,
  DEFAULT_STYLE,
  type AsciiAquariumConfig,
} from "./config";
import { AsciiAquariumControls } from "./Controls";
import { AsciiAquariumRenderer } from "./Renderer";

export const asciiAquariumModule = defineModule({
  manifest: asciiAquariumManifest,
  configSchema: AsciiAquariumConfigSchema,
  Controls: AsciiAquariumControls,
  Renderer: AsciiAquariumRenderer,
  /**
   * Primary action = cycle to the next aquarium art style. Mapped to the
   * Enter key on the renderer (and the center macropad button on the Pi),
   * so pressing the center key while the aquarium is showing flips between
   * pixel-art and ASCII.
   */
  onPrimaryAction: (config: AsciiAquariumConfig) => {
    const current = config.style ?? DEFAULT_STYLE;
    const idx = AQUARIUM_STYLES.indexOf(current);
    const next = AQUARIUM_STYLES[(idx + 1) % AQUARIUM_STYLES.length];
    if (next === current) return null;
    return { ...config, style: next };
  },
});

export * from "./config";
