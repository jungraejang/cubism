"use client";

import { useEffect, useState } from "react";

/**
 * Returns an `{x, y}` offset (in CSS pixels) that re-randomizes every
 * `intervalMs` within `[-maxPx, maxPx]` on each axis. Used to nudge a static
 * UI off the same screen pixels - the OLED-burn-in mitigation technique used
 * by digital signage and TV manufacturers.
 *
 * Consumers should pass `{ x, y }` to a `motion.div`'s `animate` prop with a
 * gentle ease so the shift is imperceptible.
 */
export function usePixelShift(maxPx = 3, intervalMs = 60_000) {
  const [shift, setShift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const pick = () => {
      const r = () => Math.floor(Math.random() * (maxPx * 2 + 1)) - maxPx;
      setShift({ x: r(), y: r() });
    };
    pick();
    const id = window.setInterval(pick, intervalMs);
    return () => window.clearInterval(id);
  }, [maxPx, intervalMs]);

  return shift;
}

export const PIXEL_SHIFT_DURATION_S = 2;
