import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

/**
 * ASCII aquarium configuration. Counts are validated server-side via Zod so
 * a malformed payload can't push the Pi into rendering excessive entities.
 */
/**
 * Visual style for the aquarium.
 *  - `ascii`: monospace glyph art (the original look).
 *  - `pixel`: 8-bit PNG sprites served from the renderer's public folder.
 * Both share the same motion system; only the rendered element differs.
 */
export const AQUARIUM_STYLES = ["ascii", "pixel"] as const;
export type AquariumStyle = (typeof AQUARIUM_STYLES)[number];

export const AsciiAquariumConfigSchema = z.object({
  /** Which art style the aquarium renders with. */
  style: z.enum(AQUARIUM_STYLES).optional(),
  /** How many fish the aquarium attempts to render. */
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
  ...OrientationFields,
});

export type AsciiAquariumConfig = z.infer<typeof AsciiAquariumConfigSchema>;

export const DEFAULT_STYLE: AquariumStyle = "pixel";
export const DEFAULT_FISH_COUNT = 6;
export const DEFAULT_FISH_SPEED = 1;
export const DEFAULT_SEAWEED_COUNT = 4;
export const DEFAULT_BUBBLE_RATE = 30;
export const DEFAULT_BACKGROUND_COLOR = "#031827";
export const DEFAULT_FISH_COLOR = "#67e8f9";
export const DEFAULT_SEAWEED_COLOR = "#4ade80";
export const DEFAULT_BUBBLE_COLOR = "#bae6fd";

/** Slider maxima in the control panel. */
export const NORMAL_CAPS = {
  fishCount: 14,
  seaweedCount: 8,
  bubblePoolSize: 24,
} as const;
