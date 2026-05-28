import type { ModuleManifest } from "../types";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DETAIL_COLOR,
  DEFAULT_TEXT_COLOR,
  type SpotifyModuleConfig,
} from "./config";

export const spotifyManifest: ModuleManifest<SpotifyModuleConfig> = {
  id: "spotify",
  name: "Spotify",
  description:
    "Live 'Now Playing' from your Spotify account. Set up once via OAuth from the control panel.",
  version: "0.1.0",
  permissions: ["network"],
  defaultConfig: {
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    displayName: undefined,
    accentColor: DEFAULT_ACCENT_COLOR,
    textColor: DEFAULT_TEXT_COLOR,
    detailColor: DEFAULT_DETAIL_COLOR,
    rotation: 180,
    flipHorizontal: true,
    flipVertical: false,
  },
};
