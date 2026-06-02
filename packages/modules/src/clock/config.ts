import { z } from "zod";

/**
 * Runtime schema for the Clock module's config. This is the single source of
 * truth: the TypeScript type `ClockModuleConfig` is inferred from the schema,
 * and the renderer validates incoming socket payloads against it before
 * trusting the data.
 */
export const ClockConfigSchema = z.object({
  format: z.enum(["12h", "24h"]),
  showSeconds: z.boolean(),
  timezone: z.string().optional(),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
  flipHorizontal: z.boolean().optional(),
  flipVertical: z.boolean().optional(),
  /** Hex color (e.g. "#22d3ee") for the clock circle, rings, and halo glow. */
  circleColor: z.string().optional(),
  /** Hex color (e.g. "#67e8f9") for the time digits. */
  textColor: z.string().optional(),
  /** Hex color (e.g. "#a5f3fc") for the date label below the time. */
  dateColor: z.string().optional(),
  /**
   * Pi-friendly mode: skips per-digit Framer animations, uses CSS-only
   * motion for rings/halo, drops the inner ring, and uses cheaper text glow.
   */
  performanceMode: z.boolean().optional(),
});

export type ClockModuleConfig = z.infer<typeof ClockConfigSchema>;

export type ClockRotation = NonNullable<ClockModuleConfig["rotation"]>;

export const DEFAULT_PERFORMANCE_MODE = true;

export const DEFAULT_CIRCLE_COLOR = "#22d3ee";
export const DEFAULT_TEXT_COLOR = "#67e8f9";
export const DEFAULT_DATE_COLOR = "#a5f3fc";
