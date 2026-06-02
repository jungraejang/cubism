"use client";

import { motion } from "framer-motion";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import type { ControlsProps } from "../types";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_BUBBLE_RATE,
  DEFAULT_FISH_COUNT,
  DEFAULT_FISH_SPEED,
  DEFAULT_SEAWEED_COLOR,
  DEFAULT_SEAWEED_COUNT,
  NORMAL_CAPS,
  type AsciiAquariumConfig,
} from "./config";

export function AsciiAquariumControls({
  config,
  onChange,
}: ControlsProps<AsciiAquariumConfig>) {
  function patch(next: Partial<AsciiAquariumConfig>) {
    onChange({ ...config, ...next });
  }

  const rotation = config.rotation ?? 0;
  const fishCount = config.fishCount ?? DEFAULT_FISH_COUNT;
  const fishSpeed = config.fishSpeed ?? DEFAULT_FISH_SPEED;
  const seaweedCount = config.seaweedCount ?? DEFAULT_SEAWEED_COUNT;
  const bubbleRate = config.bubbleRate ?? DEFAULT_BUBBLE_RATE;
  const backgroundColor = config.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const seaweedColor = config.seaweedColor ?? DEFAULT_SEAWEED_COLOR;
  const bubbleColor = config.bubbleColor ?? DEFAULT_BUBBLE_COLOR;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <span className="text-zinc-400">Population</span>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span className="flex items-baseline justify-between">
            <span>Fish</span>
            <span className="font-mono text-xs text-zinc-500">{fishCount}</span>
          </span>
          <input
            type="range"
            min={0}
            max={NORMAL_CAPS.fishCount}
            step={1}
            value={fishCount}
            onChange={(event) =>
              patch({ fishCount: Number(event.target.value) })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span className="flex items-baseline justify-between">
            <span>Fish speed</span>
            <span className="font-mono text-xs text-zinc-500">
              {fishSpeed.toFixed(2)}×
            </span>
          </span>
          <input
            type="range"
            min={0.25}
            max={2.5}
            step={0.25}
            value={fishSpeed}
            onChange={(event) =>
              patch({ fishSpeed: Number(event.target.value) })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span className="flex items-baseline justify-between">
            <span>Seaweed</span>
            <span className="font-mono text-xs text-zinc-500">
              {seaweedCount}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={NORMAL_CAPS.seaweedCount}
            step={1}
            value={seaweedCount}
            onChange={(event) =>
              patch({ seaweedCount: Number(event.target.value) })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span className="flex items-baseline justify-between">
            <span>Bubble rate (per min)</span>
            <span className="font-mono text-xs text-zinc-500">
              {bubbleRate}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={bubbleRate}
            onChange={(event) =>
              patch({ bubbleRate: Number(event.target.value) })
            }
          />
        </label>

        <p className="text-xs text-zinc-500">
          Higher counts look richer but use more CPU on the Pi — dial them back
          if the display feels sluggish.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400">Colors</span>
        <div className="flex flex-wrap items-center gap-4">
          <ColorSwatch
            label="Background"
            value={backgroundColor}
            onChange={(v) => patch({ backgroundColor: v })}
          />
          <ColorSwatch
            label="Seaweed"
            value={seaweedColor}
            onChange={(v) => patch({ seaweedColor: v })}
          />
          <ColorSwatch
            label="Bubbles"
            value={bubbleColor}
            onChange={(v) => patch({ bubbleColor: v })}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Fish cycle through a built-in palette of six vibrant colors so a
          school doesn&apos;t look like clones.
        </p>
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

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} color`}
        className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
      />
      <span>{label}</span>
    </label>
  );
}
