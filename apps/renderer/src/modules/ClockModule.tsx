"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ClockModuleConfig } from "@cubism/protocol";

type Props = {
  config: ClockModuleConfig;
};

const DEFAULT_CIRCLE_COLOR = "#22d3ee";
const DEFAULT_TEXT_COLOR = "#67e8f9";

/**
 * Converts a #RRGGBB hex string into an rgba() string at the given alpha. Used
 * so the user's chosen colors flow through to every layer (border, halo,
 * inner rings, text glow) at appropriate opacities.
 */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

export function ClockModule({ config }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
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

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <motion.div
        animate={{ rotate: rotation, scaleX, scaleY }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
        style={{ color: textColor }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.7, filter: "blur(18px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.8, filter: "blur(12px)" }}
          transition={{ duration: 0.9, ease: "easeOut" }}
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
                <AnimatedChar key={i} char={char} isDigit={/\d/.test(char)} />
              ))}
            </div>
            <div
              className="mt-6 text-[4.5vmin] uppercase tracking-[0.35em]"
              style={{ color: withAlpha(textColor, 0.7) }}
            >
              {date}
            </div>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle, ${withAlpha(circleColor, 0.2)}, transparent 55%)`,
          }}
        />
      </motion.div>
    </div>
  );
}
