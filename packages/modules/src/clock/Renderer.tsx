"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { withAlpha } from "../_lib/withAlpha";
import {
  DEFAULT_CIRCLE_COLOR,
  DEFAULT_DATE_COLOR,
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
 *
 * The motion is far too small and slow to perceive, but it prevents any single
 * sub-pixel from accumulating uninterrupted "on time" - the same trick OLED
 * TVs use internally. The shift is applied OUTSIDE the orientation transform
 * so it always moves in display-pixel space regardless of rotate/flip.
 */
const PIXEL_SHIFT_MAX = 3;
const PIXEL_SHIFT_INTERVAL_MS = 60_000;
const PIXEL_SHIFT_DURATION_S = 2;

/**
 * A single character cell. Digits animate with a slot-machine fall-from-above
 * effect when their value changes. Separators (colon, space, AM/PM) render
 * statically since they rarely change.
 */
function AnimatedChar({ char, isDigit }: { char: string; isDigit: boolean }) {
  if (!isDigit) {
    return <span>{char}</span>;
  }

  return (
    <span className="relative inline-block overflow-hidden leading-none">
      {/* Invisible "0" sizes the cell - all tabular digits share this width. */}
      <span aria-hidden className="invisible inline-block select-none">
        0
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={char}
          initial={{ y: "-100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ClockRenderer({ config }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

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

  const time = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: config.showSeconds ? "2-digit" : undefined,
      hour12: config.format === "12h",
      timeZone: config.timezone,
    }).format(now);
  }, [now, config]);

  const date = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: config.timezone,
    }).format(now);
  }, [now, config]);

  const rotation = config.rotation ?? 0;
  const scaleX = config.flipHorizontal ? -1 : 1;
  const scaleY = config.flipVertical ? -1 : 1;
  const circleColor = config.circleColor ?? DEFAULT_CIRCLE_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const dateColor = config.dateColor ?? DEFAULT_DATE_COLOR;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      {/*
       * initial={false} on the pixel-shift and orientation wrappers stops them
       * animating from their defaults on mount (the carousel transition in the
       * renderer page handles entrance). They still animate when their target
       * values change later - i.e. when the user adjusts orientation, the
       * clock rotates smoothly to the new angle.
       */}
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
              borderColor: withAlpha(circleColor, 0.4),
              backgroundColor: withAlpha(circleColor, 0.05),
              boxShadow: `0 0 80px ${withAlpha(circleColor, 0.35)}`,
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute inset-8 rounded-full border border-dashed"
              style={{ borderColor: withAlpha(circleColor, 0.25) }}
            />

            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
              className="absolute inset-20 rounded-full border"
              style={{ borderColor: withAlpha(circleColor, 0.15) }}
            />

            <div className="text-center">
              <div
                className="flex items-center justify-center text-[12vmin] font-bold tracking-tight tabular-nums"
                style={{ filter: `drop-shadow(0 0 30px ${textColor})` }}
              >
                {time.split("").map((char, i) => (
                  <AnimatedChar
                    key={i}
                    char={char}
                    isDigit={/\d/.test(char)}
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

          <motion.div
            animate={{ opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle, ${withAlpha(circleColor, 0.2)}, transparent 55%)`,
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
