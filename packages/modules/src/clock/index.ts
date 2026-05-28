import { defineModule } from "../defineModule";
import { clockManifest } from "./manifest";
import { ClockConfigSchema } from "./config";
import { ClockControls } from "./Controls";
import { ClockRenderer } from "./Renderer";

export const clockModule = defineModule({
  manifest: clockManifest,
  configSchema: ClockConfigSchema,
  Controls: ClockControls,
  Renderer: ClockRenderer,
});

export * from "./config";
