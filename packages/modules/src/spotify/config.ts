import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

export const SpotifyConfigSchema = z.object({
  /** Spotify Developer App Client ID. */
  clientId: z.string(),
  /** Spotify Developer App Client Secret. Stored as-is in module config. */
  clientSecret: z.string(),
  /**
   * Long-lived refresh token from the Authorization Code flow. Used to mint
   * short-lived access tokens for the Web API. Empty until the user clicks
   * "Connect Spotify" in the desktop controls.
   */
  refreshToken: z.string(),
  /** Optional friendly display name of the connected Spotify user. */
  displayName: z.string().optional(),
  /** Accent color for highlights and album art glow. */
  accentColor: z.string().optional(),
  /** Color for track and artist text. */
  textColor: z.string().optional(),
  /** Color for secondary details (album name, progress text). */
  detailColor: z.string().optional(),
  ...OrientationFields,
});

export type SpotifyModuleConfig = z.infer<typeof SpotifyConfigSchema>;

export const DEFAULT_ACCENT_COLOR = "#22d3ee";
export const DEFAULT_TEXT_COLOR = "#67e8f9";
export const DEFAULT_DETAIL_COLOR = "#a5f3fc";

/** Scopes requested during OAuth. Read-only access to currently-playing state. */
export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");
