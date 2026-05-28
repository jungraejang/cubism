/**
 * Browser-safe helpers for the Spotify Web API.
 *
 * Spotify's accounts.spotify.com and api.spotify.com endpoints both support
 * CORS for the requests we make here, so the renderer can talk to them
 * directly. Client secret is still sent from the browser - acceptable for a
 * self-hosted hologram on a trusted LAN, but worth being aware of.
 */

export type SpotifyNowPlaying = {
  isPlaying: boolean;
  trackName: string;
  artists: string[];
  albumName: string;
  albumImageUrl: string | null;
  progressMs: number;
  durationMs: number;
  /** Spotify's external_urls.spotify (web player link), if available. */
  trackUrl: string | null;
};

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

type SpotifyArtist = {
  name: string;
};

type SpotifyCurrentlyPlayingResponse = {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    duration_ms: number;
    external_urls?: { spotify?: string };
    artists: SpotifyArtist[];
    album: {
      name: string;
      images: SpotifyImage[];
    };
  } | null;
};

/**
 * Trades a refresh token for a fresh access token. Throws on any failure
 * (bad credentials, revoked token, network) so callers can show an error.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Spotify credentials are missing");
  }

  // This module is only ever imported into client components (the renderer)
  // so `btoa` is always available.
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    let message = "Could not refresh Spotify access token";
    try {
      const err = (await res.json()) as { error_description?: string };
      if (err.error_description) message = err.error_description;
    } catch {
      // ignore JSON parse error and use generic message
    }
    throw new Error(message);
  }

  const data = (await res.json()) as SpotifyTokenResponse;
  return {
    accessToken: data.access_token,
    // Refresh ~1 minute before actual expiry for safety.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

/**
 * Fetches the user's currently playing item. Returns null when the endpoint
 * responds 204 (nothing playing) or when the response has no `item`.
 */
export async function getCurrentlyPlaying(
  accessToken: string,
): Promise<SpotifyNowPlaying | null> {
  const res = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (res.status === 204) return null;
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    throw new Error(`Spotify returned ${res.status}`);
  }

  const data = (await res.json()) as SpotifyCurrentlyPlayingResponse;
  if (!data.item) return null;

  return {
    isPlaying: data.is_playing,
    trackName: data.item.name,
    artists: data.item.artists.map((a) => a.name),
    albumName: data.item.album.name,
    albumImageUrl: data.item.album.images[0]?.url ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms,
    trackUrl: data.item.external_urls?.spotify ?? null,
  };
}

export function formatTrackTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
