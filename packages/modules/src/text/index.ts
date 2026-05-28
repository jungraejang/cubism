import { defineModule } from "../defineModule";
import { textManifest } from "./manifest";
import { TextConfigSchema } from "./config";
import { TextControls } from "./Controls";
import { TextRenderer } from "./Renderer";

export const textModule = defineModule({
  manifest: textManifest,
  configSchema: TextConfigSchema,
  Controls: TextControls,
  Renderer: TextRenderer,
});

export * from "./config";
