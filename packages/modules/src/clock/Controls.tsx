"use client";

import { motion } from "framer-motion";
import type { ControlsProps } from "../types";
import {
  DEFAULT_CIRCLE_COLOR,
  DEFAULT_DATE_COLOR,
  DEFAULT_TEXT_COLOR,
  type ClockModuleConfig,
  type ClockRotation,
} from "./config";

const ROTATION_OPTIONS: { value: ClockRotation; label: string }[] = [
  { value: 0, label: "Normal" },
  { value: 90, label: "Right" },
  { value: 180, label: "Upside down" },
  { value: 270, label: "Left" },
];

export function ClockControls({
  config,
  onChange,
}: ControlsProps<ClockModuleConfig>) {
  /**
   * All field updates funnel through this single patch helper so the parent
   * always receives a complete next config object. Keeps the call sites tidy
   * and removes any chance of forgetting to spread the previous config.
   */
  function patch(next: Partial<ClockModuleConfig>) {
    onChange({ ...config, ...next });
  }

  const rotation = config.rotation ?? 0;
  const circleColor = config.circleColor ?? DEFAULT_CIRCLE_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const dateColor = config.dateColor ?? DEFAULT_DATE_COLOR;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-3">
        <span className="w-32 text-zinc-400">Format</span>
        <select
          className="rounded-lg bg-zinc-800 px-3 py-2 text-white"
          value={config.format}
          onChange={(event) =>
            patch({ format: event.target.value as "12h" | "24h" })
          }
        >
          <option value="12h">12 hour</option>
          <option value="24h">24 hour</option>
        </select>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={config.showSeconds}
          onChange={(event) => patch({ showSeconds: event.target.checked })}
        />
        <span>Show seconds</span>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Colors</span>
          <p className="text-xs text-zinc-500">
            Customize the circle, time, and date colors.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={circleColor}
              onChange={(event) => patch({ circleColor: event.target.value })}
              aria-label="Clock circle color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Circle</span>
            <span className="font-mono text-xs text-zinc-500">
              {circleColor}
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={textColor}
              onChange={(event) => patch({ textColor: event.target.value })}
              aria-label="Clock time color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Time</span>
            <span className="font-mono text-xs text-zinc-500">{textColor}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={dateColor}
              onChange={(event) => patch({ dateColor: event.target.value })}
              aria-label="Clock date color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Date</span>
            <span className="font-mono text-xs text-zinc-500">{dateColor}</span>
          </label>

          <button
            type="button"
            onClick={() =>
              patch({
                circleColor: DEFAULT_CIRCLE_COLOR,
                textColor: DEFAULT_TEXT_COLOR,
                dateColor: DEFAULT_DATE_COLOR,
              })
            }
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Orientation</span>
          <p className="text-xs text-zinc-500">
            Rotate to compensate for beam-splitter optics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ROTATION_OPTIONS.map((option) => {
            const active = rotation === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={() => patch({ rotation: option.value })}
                aria-pressed={active}
                className={`flex min-w-22 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-cyan-400 text-zinc-950"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block text-base leading-none"
                  style={{ transform: `rotate(${option.value}deg)` }}
                >
                  ↑
                </span>
                <span>{option.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Mirror</span>
          <p className="text-xs text-zinc-500">
            Some splitters reflect a single axis instead of rotating.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => patch({ flipHorizontal: !config.flipHorizontal })}
            aria-pressed={config.flipHorizontal ?? false}
            className={`flex min-w-32 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              config.flipHorizontal
                ? "bg-cyan-400 text-zinc-950"
                : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              ↔
            </span>
            <span>Mirror horizontal</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => patch({ flipVertical: !config.flipVertical })}
            aria-pressed={config.flipVertical ?? false}
            className={`flex min-w-32 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              config.flipVertical
                ? "bg-cyan-400 text-zinc-950"
                : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              ↕
            </span>
            <span>Mirror vertical</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
