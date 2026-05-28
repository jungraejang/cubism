"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { orientationTransform } from "../_lib/orientation";
import { PIXEL_SHIFT_DURATION_S, usePixelShift } from "../_lib/usePixelShift";
import { withAlpha } from "../_lib/withAlpha";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DETAIL_COLOR,
  DEFAULT_TEXT_COLOR,
  type SpotifyModuleConfig,
} from "./config";
import {
  formatTrackTime,
  getCurrentlyPlaying,
  refreshAccessToken,
  type SpotifyNowPlaying,
} from "./spotifyApi";

type Props = {
  config: SpotifyModuleConfig;
};

/** Poll cadence for the currently-playing endpoint. */
const POLL_INTERVAL_MS = 5_000;
/**
 * Local progress tick. Spotify only returns progress_ms at poll time, so we
 * extrapolate forward at 250ms so the progress bar moves smoothly.
 */
const LOCAL_TICK_MS = 250;

export function SpotifyRenderer({ config }: Props) {
  const pixelShift = usePixelShift();
  const [track, setTrack] = useState<SpotifyNowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Locally extrapolated progress (resets whenever a fresh poll lands). */
  const [localProgressMs, setLocalProgressMs] = useState(0);

  const accentColor = config.accentColor ?? DEFAULT_ACCENT_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const detailColor = config.detailColor ?? DEFAULT_DETAIL_COLOR;
  const { rotate, scaleX, scaleY } = orientationTransform(config);

  /**
   * Cached access token. We hold this in a ref rather than state because
   * re-renders aren't needed when it changes - the next poll will pick it up.
   */
  const tokenRef = useRef<{ accessToken: string; expiresAt: number } | null>(
    null,
  );
  const lastPollAtRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    tokenRef.current = null;

    async function ensureToken(): Promise<string> {
      const existing = tokenRef.current;
      if (existing && existing.expiresAt > Date.now()) {
        return existing.accessToken;
      }
      const fresh = await refreshAccessToken(
        config.clientId,
        config.clientSecret,
        config.refreshToken,
      );
      tokenRef.current = fresh;
      return fresh.accessToken;
    }

    async function poll() {
      try {
        const accessToken = await ensureToken();
        let data: SpotifyNowPlaying | null;
        try {
          data = await getCurrentlyPlaying(accessToken);
        } catch (err) {
          if (err instanceof Error && err.message === "UNAUTHORIZED") {
            // Token may have been revoked - try one more time with a fresh one.
            tokenRef.current = null;
            const retryToken = await ensureToken();
            data = await getCurrentlyPlaying(retryToken);
          } else {
            throw err;
          }
        }
        if (cancelled) return;
        setTrack(data);
        setLocalProgressMs(data?.progressMs ?? 0);
        lastPollAtRef.current = Date.now();
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Spotify request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!config.refreshToken || !config.clientId || !config.clientSecret) {
      setLoading(false);
      setError(null);
      setTrack(null);
      return;
    }

    void poll();
    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config.clientId, config.clientSecret, config.refreshToken]);

  /**
   * Smooth progress tick. We only advance when the track is playing; when
   * paused the bar should freeze.
   */
  useEffect(() => {
    if (!track || !track.isPlaying) return;
    const id = window.setInterval(() => {
      setLocalProgressMs((prev) => {
        const elapsed = Date.now() - lastPollAtRef.current;
        const projected = (track.progressMs ?? 0) + elapsed;
        if (projected >= track.durationMs) return track.durationMs;
        // Use max so a freshly-polled progressMs (already applied to state)
        // doesn't get clobbered by a stale extrapolation.
        return Math.max(prev, projected);
      });
    }, LOCAL_TICK_MS);
    return () => window.clearInterval(id);
  }, [track]);

  const needsSetup =
    !config.refreshToken || !config.clientId || !config.clientSecret;
  const progressFraction = track
    ? Math.min(1, Math.max(0, localProgressMs / Math.max(1, track.durationMs)))
    : 0;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{ duration: PIXEL_SHIFT_DURATION_S, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={false}
          animate={{ rotate, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="relative flex h-full w-full items-center justify-center"
          style={{ color: textColor }}
        >
          <div className="flex max-w-[90vw] flex-col items-center text-center">
            {needsSetup ? (
              <div>
                <p
                  className="text-[5vmin] font-semibold"
                  style={{ color: textColor }}
                >
                  Spotify not connected
                </p>
                <p
                  className="mt-3 text-[2.8vmin]"
                  style={{ color: detailColor }}
                >
                  Open the desktop control panel and click
                  <br />
                  <span className="font-semibold">Connect Spotify</span>.
                </p>
              </div>
            ) : loading && !track ? (
              <p
                className="text-[3.5vmin] uppercase tracking-[0.25em]"
                style={{ color: detailColor }}
              >
                Loading…
              </p>
            ) : error ? (
              <div>
                <p
                  className="text-[4vmin] font-semibold"
                  style={{ color: textColor }}
                >
                  Spotify unavailable
                </p>
                <p
                  className="mt-3 text-[2.6vmin]"
                  style={{ color: detailColor }}
                >
                  {error}
                </p>
              </div>
            ) : !track ? (
              <div>
                <p
                  className="text-[4.5vmin] font-semibold"
                  style={{ color: textColor }}
                >
                  Nothing playing
                </p>
                <p
                  className="mt-3 text-[2.6vmin]"
                  style={{ color: detailColor }}
                >
                  Start a song on Spotify to see it here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                {track.albumImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.albumImageUrl}
                    alt={`${track.albumName} cover`}
                    className="h-[42vmin] w-[42vmin] rounded-2xl object-cover"
                    style={{
                      boxShadow: `0 0 60px ${withAlpha(accentColor, 0.55)}`,
                      filter: track.isPlaying
                        ? undefined
                        : "grayscale(0.4) brightness(0.7)",
                    }}
                  />
                ) : (
                  <div
                    className="h-[42vmin] w-[42vmin] rounded-2xl"
                    style={{ backgroundColor: withAlpha(accentColor, 0.2) }}
                  />
                )}

                <p
                  className="mt-6 max-w-[70vw] truncate text-[5vmin] font-bold leading-tight"
                  style={{
                    textShadow: `0 0 22px ${withAlpha(textColor, 0.7)}`,
                  }}
                  title={track.trackName}
                >
                  {track.trackName}
                </p>
                <p
                  className="mt-2 max-w-[70vw] truncate text-[3vmin]"
                  style={{ color: detailColor }}
                  title={track.artists.join(", ")}
                >
                  {track.artists.join(", ")}
                </p>
                <p
                  className="mt-1 max-w-[70vw] truncate text-[2.2vmin] opacity-70"
                  style={{ color: detailColor }}
                  title={track.albumName}
                >
                  {track.albumName}
                </p>

                <div className="mt-6 flex w-[60vmin] max-w-[80vw] flex-col gap-1.5">
                  <div
                    className="relative h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: withAlpha(detailColor, 0.18) }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${progressFraction * 100}%`,
                        backgroundColor: accentColor,
                        boxShadow: `0 0 16px ${accentColor}`,
                        transition: "width 0.25s linear",
                      }}
                    />
                  </div>
                  <div
                    className="flex justify-between font-mono text-[2vmin] opacity-80"
                    style={{ color: detailColor }}
                  >
                    <span>{formatTrackTime(localProgressMs)}</span>
                    <span>
                      {track.isPlaying ? "" : "Paused · "}
                      {formatTrackTime(track.durationMs)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <motion.div
            animate={{ opacity: [0.12, 0.28, 0.12] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle, ${withAlpha(accentColor, 0.18)}, transparent 55%)`,
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
