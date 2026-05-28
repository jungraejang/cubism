import { defineModule } from "../defineModule";
import { audioManifest } from "./manifest";
import { AudioConfigSchema } from "./config";
import { AudioControls } from "./Controls";
import { AudioRenderer } from "./Renderer";

export const audioModule = defineModule({
  manifest: audioManifest,
  configSchema: AudioConfigSchema,
  Controls: AudioControls,
  Renderer: AudioRenderer,
});

export * from "./config";
