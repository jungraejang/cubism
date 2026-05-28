import { defineModule } from "../defineModule";
import { weatherManifest } from "./manifest";
import { WeatherConfigSchema } from "./config";
import { WeatherControls } from "./Controls";
import { WeatherRenderer } from "./Renderer";

export const weatherModule = defineModule({
  manifest: weatherManifest,
  configSchema: WeatherConfigSchema,
  Controls: WeatherControls,
  Renderer: WeatherRenderer,
});

export * from "./config";
