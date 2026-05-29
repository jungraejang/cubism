import { defineModule } from "../defineModule";
import { visualizerManifest } from "./manifest";
import {
  DEFAULT_STYLE,
  VISUALIZER_STYLE_OPTIONS,
  VisualizerConfigSchema,
  type VisualizerModuleConfig,
} from "./config";
import { VisualizerControls } from "./Controls";
import { VisualizerRenderer } from "./Renderer";

const STYLE_CYCLE = VISUALIZER_STYLE_OPTIONS.map((o) => o.value);

export const visualizerModule = defineModule({
  manifest: visualizerManifest,
  configSchema: VisualizerConfigSchema,
  Controls: VisualizerControls,
  Renderer: VisualizerRenderer,
  /**
   * Primary action = cycle to the next visualizer style. Mapped to the
   * Enter key on the renderer (and the center macropad button on the Pi).
   * Keeps per-style settings intact since each style stores its own
   * config in `styleSettings[style]`.
   */
  onPrimaryAction: (config: VisualizerModuleConfig) => {
    const current = config.style ?? DEFAULT_STYLE;
    const idx = STYLE_CYCLE.indexOf(current);
    const next = STYLE_CYCLE[(idx + 1) % STYLE_CYCLE.length];
    if (next === current) return null;
    return { ...config, style: next };
  },
});

export * from "./config";
