import { defineModule } from "../defineModule";
import { spotifyManifest } from "./manifest";
import { SpotifyConfigSchema } from "./config";
import { SpotifyControls } from "./Controls";
import { SpotifyRenderer } from "./Renderer";

export const spotifyModule = defineModule({
  manifest: spotifyManifest,
  configSchema: SpotifyConfigSchema,
  Controls: SpotifyControls,
  Renderer: SpotifyRenderer,
});

export * from "./config";
