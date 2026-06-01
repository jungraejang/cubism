import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

/**
 * ASCII aquarium configuration. Counts are validated server-side via Zod so
 * a malformed payload can't push the Pi into rendering 10,000 fish — but the
 * actual rendering ceiling lives in `performanceMode` clamps inside the
 * Renderer, not in the schema.
 */
export const AsciiAquariumConfigSchema = z.object({
  /** How many fish the aquarium attempts to render. Hard-capped by perf mode. */
  fishCount: z.number().int().min(0).max(20).optional(),
  /**
   * Multiplier on the base fish swim speed. 1 = the original tuning; the
   * slider exposes a 0.25–2.5 range so the tank can read as calm or lively.
   */
  fishSpeed: z.number().min(0.1).max(5).optional(),
  /** How many seaweed stalks anchor along the bottom. */
  seaweedCount: z.number().int().min(0).max(12).optional(),
  /**
   * Bubble spawn pressure, expressed in bubbles-per-minute. The renderer
   * derives a fixed bubble pool size from this (no spawning churn — bubbles
   * are recycled when they reach the surface).
   */
  bubbleRate: z.number().int().min(0).max(120).optional(),
  /** Hex color for the scene background (rendered as a flat clear color). */
  backgroundColor: z.string().optional(),
  /** Hex color for fish glyphs. */
  fishColor: z.string().optional(),
  /** Hex color for seaweed glyphs. */
  seaweedColor: z.string().optional(),
  /** Hex color for bubble glyphs. */
  bubbleColor: z.string().optional(),
  /**
   * Pi 4-friendly mode: caps the canvas DPR at 1 and throttles the
   * `useFrame` loop to ~30 fps. Defaults to `true` since the Pi is the
   * primary target — desktop previews look fine in perf mode too, just a
   * touch less smooth.
   */
  performanceMode: z.boolean().optional(),
  ...OrientationFields,
});

export type AsciiAquariumConfig = z.infer<typeof AsciiAquariumConfigSchema>;

export const DEFAULT_FISH_COUNT = 6;
export const DEFAULT_FISH_SPEED = 1;
export const DEFAULT_SEAWEED_COUNT = 4;
export const DEFAULT_BUBBLE_RATE = 30;
export const DEFAULT_BACKGROUND_COLOR = "#031827";
export const DEFAULT_FISH_COLOR = "#67e8f9";
export const DEFAULT_SEAWEED_COLOR = "#4ade80";
export const DEFAULT_BUBBLE_COLOR = "#bae6fd";
export const DEFAULT_PERFORMANCE_MODE = true;

/**
 * Hard ceilings applied at render time. Anything the user dials above these
 * (via the Controls panel or a malformed config) is silently clamped — the
 * schema's `.max()` is a much looser sanity bound; this is the "what your Pi
 * can actually handle" line.
 */
export const PERF_CAPS = {
  fishCount: 6,
  seaweedCount: 4,
  bubblePoolSize: 10,
} as const;

export const NORMAL_CAPS = {
  fishCount: 14,
  seaweedCount: 8,
  bubblePoolSize: 24,
} as const;
