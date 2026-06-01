import { defineModule } from "../defineModule";
import { asciiAquariumManifest } from "./manifest";
import { AsciiAquariumConfigSchema } from "./config";
import { AsciiAquariumControls } from "./Controls";
import { AsciiAquariumRenderer } from "./Renderer";

export const asciiAquariumModule = defineModule({
  manifest: asciiAquariumManifest,
  configSchema: AsciiAquariumConfigSchema,
  Controls: AsciiAquariumControls,
  Renderer: AsciiAquariumRenderer,
});

export * from "./config";
