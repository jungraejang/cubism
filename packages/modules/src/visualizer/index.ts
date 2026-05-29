import { defineModule } from "../defineModule";
import { visualizerManifest } from "./manifest";
import { VisualizerConfigSchema } from "./config";
import { VisualizerControls } from "./Controls";
import { VisualizerRenderer } from "./Renderer";

export const visualizerModule = defineModule({
  manifest: visualizerManifest,
  configSchema: VisualizerConfigSchema,
  Controls: VisualizerControls,
  Renderer: VisualizerRenderer,
});

export * from "./config";
