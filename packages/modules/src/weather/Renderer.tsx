"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orientationTransform } from "../_lib/orientation";
import {
  PIXEL_SHIFT_DURATION_S,
  usePixelShift,
} from "../_lib/usePixelShift";
import { withAlpha } from "../_lib/withAlpha";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DETAIL_COLOR,
  DEFAULT_TEXT_COLOR,
  normalizeZipCode,
  type WeatherModuleConfig,
} from "./config";
import { fetchWeatherForZip, type WeatherSnapshot } from "./fetchWeather";
import { getWeatherIcon } from "./weatherIcon";

type Props = {
  config: WeatherModuleConfig;
};

/** Re-fetch interval while the module is displayed (15 minutes). */
const REFRESH_MS = 15 * 60_000;

export function WeatherRenderer({ config }: Props) {
  const pixelShift = usePixelShift();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const zip = normalizeZipCode(config.zipCode);
  const accentColor = config.accentColor ?? DEFAULT_ACCENT_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const detailColor = config.detailColor ?? DEFAULT_DETAIL_COLOR;
  const { rotate, scaleX, scaleY } = orientationTransform(config);

  const WeatherIcon = weather
    ? getWeatherIcon(weather.weatherCode, weather.isDay)
    : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWeatherForZip(config.zipCode);
        if (!cancelled) {
          setWeather(data);
        }
      } catch (err) {
        if (!cancelled) {
          setWeather(null);
          setError(
            err instanceof Error ? err.message : "Failed to load weather",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config.zipCode]);

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
          <div className="relative flex max-w-[90vw] flex-col items-center justify-center px-[4vmin] text-center">
            {loading && !weather ? (
              <p
                className="text-[4vmin] uppercase tracking-[0.2em]"
                style={{ color: detailColor }}
              >
                Loading…
              </p>
            ) : null}

            {error ? (
              <div className="text-center">
                <p
                  className="text-[4vmin] font-semibold"
                  style={{ color: textColor }}
                >
                  Weather unavailable
                </p>
                <p
                  className="mt-4 text-[2.8vmin]"
                  style={{ color: detailColor }}
                >
                  {error}
                </p>
                <p
                  className="mt-2 font-mono text-[2.4vmin] opacity-70"
                  style={{ color: detailColor }}
                >
                  ZIP {zip || config.zipCode}
                </p>
              </div>
            ) : null}

            {weather && WeatherIcon ? (
              <div className="flex flex-col items-center text-center">
                <WeatherIcon
                  aria-hidden
                  className="text-[38vmin] leading-none"
                  style={{
                    color: accentColor,
                    filter: `drop-shadow(0 0 48px ${accentColor})`,
                  }}
                />
                <div
                  className="mt-4 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1"
                  style={{ filter: `drop-shadow(0 0 28px ${textColor})` }}
                >
                  <span className="text-[9vmin] font-bold tabular-nums leading-none">
                    {weather.temperatureF}°F
                  </span>
                  <span
                    className="text-[4vmin] font-light opacity-60"
                    style={{ color: detailColor }}
                    aria-hidden
                  >
                    /
                  </span>
                  <span className="text-[9vmin] font-bold tabular-nums leading-none">
                    {weather.temperatureC}°C
                  </span>
                </div>
                <p
                  className="mt-1 text-[3vmin] uppercase tracking-[0.25em]"
                  style={{ color: detailColor }}
                >
                  {weather.conditionLabel}
                </p>
                <p className="mt-6 text-[3.5vmin] font-medium">
                  {weather.locationName}
                  {weather.region ? `, ${weather.region}` : ""}
                </p>
                <p
                  className="mt-1 font-mono text-[2.5vmin] opacity-80"
                  style={{ color: detailColor }}
                >
                  {zip}
                </p>
                <div
                  className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[2.6vmin] uppercase tracking-wider"
                  style={{ color: detailColor }}
                >
                  <span>
                    Feels {weather.apparentTemperatureF}°F /{" "}
                    {weather.apparentTemperatureC}°C
                  </span>
                  <span>Humidity {weather.humidity}%</span>
                  <span>
                    Wind {weather.windMph} mph / {weather.windKmh} km/h
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <motion.div
            animate={{ opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle, ${withAlpha(accentColor, 0.2)}, transparent 55%)`,
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
