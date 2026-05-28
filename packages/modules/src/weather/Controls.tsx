"use client";

import { motion } from "framer-motion";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import type { ControlsProps } from "../types";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DETAIL_COLOR,
  DEFAULT_TEXT_COLOR,
  type WeatherModuleConfig,
} from "./config";

export function WeatherControls({
  config,
  onChange,
}: ControlsProps<WeatherModuleConfig>) {
  function patch(next: Partial<WeatherModuleConfig>) {
    onChange({ ...config, ...next });
  }

  const rotation = config.rotation ?? 0;
  const accentColor = config.accentColor ?? DEFAULT_ACCENT_COLOR;
  const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
  const detailColor = config.detailColor ?? DEFAULT_DETAIL_COLOR;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-zinc-400">ZIP code</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="10001"
          maxLength={10}
          className="w-full max-w-xs rounded-lg bg-zinc-800 px-3 py-2 font-mono text-white"
          value={config.zipCode}
          onChange={(event) => patch({ zipCode: event.target.value.trim() })}
        />
        <span className="text-xs text-zinc-500">
          US ZIP only. Weather is fetched on the hologram using free APIs (no
          signup).
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Colors</span>
          <p className="text-xs text-zinc-500">Icon glow, temperature, details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={accentColor}
              onChange={(event) => patch({ accentColor: event.target.value })}
              aria-label="Accent color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Accent</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={textColor}
              onChange={(event) => patch({ textColor: event.target.value })}
              aria-label="Text color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Text</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={detailColor}
              onChange={(event) => patch({ detailColor: event.target.value })}
              aria-label="Detail color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Details</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400">Orientation</span>
        <div className="flex flex-wrap gap-2">
          {ROTATION_OPTIONS.map((option) => (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => patch({ rotation: option.value })}
              className={`rounded-lg px-3 py-2 text-sm ${
                rotation === option.value
                  ? "bg-cyan-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipHorizontal ?? false}
              onChange={(event) =>
                patch({ flipHorizontal: event.target.checked })
              }
            />
            Mirror horizontal
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipVertical ?? false}
              onChange={(event) =>
                patch({ flipVertical: event.target.checked })
              }
            />
            Mirror vertical
          </label>
        </div>
      </div>
    </div>
  );
}
