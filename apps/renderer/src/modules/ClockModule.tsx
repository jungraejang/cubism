"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ClockModuleConfig } from "@cubism/protocol";

type Props = {
  config: ClockModuleConfig;
};

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

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-cyan-200">
      <motion.div
        animate={{ rotate: rotation, scaleX, scaleY }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.7, filter: "blur(18px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.8, filter: "blur(12px)" }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative flex h-[80vmin] w-[80vmin] items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/5 shadow-[0_0_80px_rgba(34,211,238,0.35)]"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute inset-8 rounded-full border border-dashed border-cyan-300/20"
          />

          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
            className="absolute inset-20 rounded-full border border-cyan-300/10"
          />

          <motion.div
            animate={{
              scale: [1, 1.035, 1],
              opacity: [0.8, 1, 0.8],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="text-center"
          >
            <div className="text-[12vmin] font-bold tracking-tight drop-shadow-[0_0_30px_rgba(103,232,249,0.9)]">
              {time}
            </div>
            <div className="mt-4 text-[3vmin] uppercase tracking-[0.5em] text-cyan-100/70">
              {date}
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.2),transparent_55%)]"
        />
      </motion.div>
    </div>
  );
}
