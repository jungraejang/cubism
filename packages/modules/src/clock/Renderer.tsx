"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { withAlpha } from "../_lib/withAlpha";
import {
  DEFAULT_CIRCLE_COLOR,
  DEFAULT_DATE_COLOR,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_TEXT_COLOR,
  type ClockModuleConfig,
} from "./config";

type Props = {
  config: ClockModuleConfig;
};

/**
 * Pixel-shift parameters for burn-in mitigation. Every PIXEL_SHIFT_INTERVAL_MS
 * we pick a fresh random offset in [-PIXEL_SHIFT_MAX, PIXEL_SHIFT_MAX] for both
 * axes and ease the whole clock to it over PIXEL_SHIFT_DURATION_S seconds.
 */
const PIXEL_SHIFT_MAX = 3;
const PIXEL_SHIFT_INTERVAL_MS = 60_000;
const PIXEL_SHIFT_DURATION_S = 2;

const TIME_FORMAT_OPTS_12H_SEC: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
};
const TIME_FORMAT_OPTS_12H: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};
const TIME_FORMAT_OPTS_24H_SEC: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};
const TIME_FORMAT_OPTS_24H: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
};
const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};

/**
 * Slot-machine digit flip. Skipped in performance mode — Framer
 * AnimatePresence on 6–8 digits every second is the heaviest part of the clock
 * on a Pi.
 */
const AnimatedChar = memo(function AnimatedChar({
  char,
  isDigit,
  animateDigits,
}: {
  char: string;
  isDigit: boolean;
  animateDigits: boolean;
}) {
  if (!isDigit || !animateDigits) {
    return <span>{char}</span>;
  }

  return (
    <span className="relative inline-block overflow-hidden leading-none">
      <span aria-hidden className="invisible inline-block select-none">
        0
      </span>
      <span
        key={char}
        className="absolute inset-0 flex animate-[cubism-clock-digit-in_0.3s_ease-out] items-center justify-center"
      >
        {char}
      </span>
    </span>
  );
});

export function ClockRenderer({ config }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });

  const performanceMode = config.performanceMode ?? DEFAULT_PERFORMANCE_MODE;
  const showSeconds = config.showSeconds ?? true;

  // When seconds are hidden, tick once per minute — 60× fewer React updates.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const periodMs = showSeconds ? 1000 : 60_000;
    const alignMs = showSeconds
      ? 1000 - (Date.now() % 1000)
      : 60_000 - (Date.now() % 60_000);

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, periodMs);
    }, alignMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [showSeconds]);

  useEffect(() => {
    const pick = () => {
      const r = () =>
        Math.floor(Math.random() * (PIXEL_SHIFT_MAX * 2 + 1)) - PIXEL_SHIFT_MAX;
      setPixelShift({ x: r(), y: r() });
    };
    pick();
    const id = window.setInterval(pick, PIXEL_SHIFT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const timeFormatter = useMemo(() => {
    const opts =
      config.format === "12h"
        ? showSeconds
          ? TIME_FORMAT_OPTS_12H_SEC
          : TIME_FORMAT_OPTS_12H
        : showSeconds
          ? TIME_FORMAT_OPTS_24H_SEC
          : TIME_FORMAT_OPTS_24H;
    return new Intl.DateTimeFormat("en-US", {
      ...opts,
      timeZone: config.timezone,
    });
  }, [config.format, config.timezone, showSeconds]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        ...DATE_FORMAT_OPTS,
        timeZone: config.timezone,
      }),
    [config.timezone],
  );

  const time = useMemo(
    () => timeFormatter.format(now),
    [now, timeFormatter],
  );
  const date = useMemo(
    () => dateFormatter.format(now),
    [now, dateFormatter],
  );

  const rotation = config.rotation ?? 0;
  const scaleX = config.flipHorizontal ? -1 : 1;
  const scaleY = config.flipVertical ? -1 : 1;
  const circleColor = config.circleColor ?? DEFAULT_CIRCLE_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const dateColor = config.dateColor ?? DEFAULT_DATE_COLOR;

  const theme = useMemo(
    () => ({
      border: withAlpha(circleColor, 0.4),
      bg: withAlpha(circleColor, 0.05),
      shadow: `0 0 80px ${withAlpha(circleColor, 0.35)}`,
      halo: withAlpha(circleColor, 0.2),
      textGlow: performanceMode
        ? `0 0 20px ${withAlpha(textColor, 0.6)}`
        : `drop-shadow(0 0 30px ${textColor})`,
    }),
    [circleColor, textColor, performanceMode],
  );

  const animateDigits = !performanceMode;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <style>{`
        @keyframes cubism-clock-dial-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes cubism-clock-halo-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.35; }
        }
        @keyframes cubism-clock-digit-in {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{ duration: PIXEL_SHIFT_DURATION_S, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={false}
          animate={{ rotate: rotation, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="relative flex h-full w-full items-center justify-center"
          style={{ color: textColor }}
        >
          <div
            className="relative flex h-[80vmin] w-[80vmin] items-center justify-center rounded-full border"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.bg,
              boxShadow: theme.shadow,
            }}
          >
            <SecondsDial color={circleColor} />

            {/*
             * Fixed 12 o'clock marker — a downward triangle pinned to the top
             * of the circle. The dial rotates beneath it so the current
             * second's number sits directly under this pointer.
             */}
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                top: "1.2vmin",
                width: 0,
                height: 0,
                borderLeft: "1.4vmin solid transparent",
                borderRight: "1.4vmin solid transparent",
                borderTop: `2vmin solid ${textColor}`,
                filter: `drop-shadow(0 0 6px ${withAlpha(textColor, 0.7)})`,
              }}
            />

            <div className="text-center">
              <div
                className="flex items-center justify-center text-[12vmin] font-bold tracking-tight tabular-nums"
                style={
                  performanceMode
                    ? { textShadow: theme.textGlow }
                    : { filter: theme.textGlow }
                }
              >
                {time.split("").map((char, i) => (
                  <AnimatedChar
                    key={i}
                    char={char}
                    isDigit={/\d/.test(char)}
                    animateDigits={animateDigits}
                  />
                ))}
              </div>
              <div
                className="mt-6 text-[3.2vmin] uppercase tracking-[0.35em]"
                style={{ color: dateColor }}
              >
                {date}
              </div>
            </div>
          </div>

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle, ${theme.halo}, transparent 55%)`,
              animation: "cubism-clock-halo-pulse 4s ease-in-out infinite",
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Distance of the dial numbers from the center, in vmin. */
const DIAL_RADIUS_VMIN = 34;
/** All 60 second positions, laid out once. */
const DIAL_NUMBERS = Array.from({ length: 60 }, (_, i) => i);

/**
 * A 0–59 seconds dial that rotates so the current second sits at the 12
 * o'clock marker. Implemented as a single pure-CSS 60s linear spin with a
 * negative `animation-delay` equal to the current second (with fraction), so
 * it stays synced to the system clock with ZERO per-frame JS — the Pi only
 * composites one rotating layer. Numbers are laid out radially; the one under
 * the top marker reads upright, the rest fan around like a gauge.
 */
const SecondsDial = memo(function SecondsDial({ color }: { color: string }) {
  // Computed once on mount: where the spin should start so "now" is on top.
  // The CSS animation runs off the compositor clock thereafter, so we don't
  // recompute (and restart) it on every React tick.
  const startDelaySec = useMemo(() => {
    const now = new Date();
    return now.getSeconds() + now.getMilliseconds() / 1000;
  }, []);

  const majorColor = useMemo(() => withAlpha(color, 0.9), [color]);
  const minorColor = useMemo(() => withAlpha(color, 0.4), [color]);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        animation: "cubism-clock-dial-spin 60s linear infinite",
        animationDelay: `-${startDelaySec}s`,
        willChange: "transform",
      }}
    >
      {DIAL_NUMBERS.map((n) => {
        const isMajor = n % 5 === 0;
        return (
          <span
            key={n}
            className="absolute left-1/2 top-1/2 tabular-nums leading-none"
            style={{
              transform: `translate(-50%, -50%) rotate(${n * 6}deg) translateY(-${DIAL_RADIUS_VMIN}vmin)`,
              color: isMajor ? majorColor : minorColor,
              fontSize: isMajor ? "2.6vmin" : "1.7vmin",
              fontWeight: isMajor ? 700 : 400,
            }}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
});
