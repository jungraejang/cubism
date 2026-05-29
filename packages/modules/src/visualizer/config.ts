import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

export const AUDIO_SOURCE_OPTIONS = [
  { value: "display", label: "System / Tab audio" },
  { value: "microphone", label: "Microphone" },
] as const;

export type AudioSource = (typeof AUDIO_SOURCE_OPTIONS)[number]["value"];

export const VISUALIZER_STYLE_OPTIONS = [
  { value: "oscilloscope", label: "Oscilloscope" },
  { value: "radial-spectrum", label: "Radial spectrum" },
  { value: "concentric-rings", label: "Concentric rings" },
  { value: "stacked-waves", label: "Stacked waves" },
] as const;

export type VisualizerStyle =
  (typeof VISUALIZER_STYLE_OPTIONS)[number]["value"];

/**
 * Per-style override schema. Every field is optional — anything not set
 * here falls back to the legacy flat fields on `VisualizerConfigSchema`
 * (for migration) and then to `STYLE_DEFAULTS[style]`. See
 * `resolveStyleSettings()`.
 */
export const PerStyleSettingsSchema = z.object({
  lineColor: z.string().optional(),
  /**
   * Secondary "line" color. Currently used only by `stacked-waves`, where the
   * ridge peak fades from `lineColor` at the top to `lineColor2` at the
   * bottom, giving the peak a vertical color gradient instead of a single
   * flat hue. Other styles ignore this field.
   */
  lineColor2: z.string().optional(),
  glowColor: z.string().optional(),
  gridColor: z.string().optional(),
  lineWidth: z.number().min(1).max(12).optional(),
  sensitivity: z.number().min(0.5).max(5).optional(),
  showGrid: z.boolean().optional(),
  barCount: z.number().int().min(24).max(192).optional(),
  ringCount: z.number().int().min(2).max(24).optional(),
  ringSpeed: z.number().min(1).max(20).optional(),
  stackCount: z.number().int().min(6).max(48).optional(),
});

export type PerStyleSettings = z.infer<typeof PerStyleSettingsSchema>;

export const VisualizerConfigSchema = z.object({
  /** Which drawing routine to use on the renderer. */
  style: z
    .enum([
      "oscilloscope",
      "radial-spectrum",
      "concentric-rings",
      "stacked-waves",
    ])
    .optional(),

  /**
   * Per-style settings. Each visual stores its own colors, widths, and
   * counts here so customizing one style no longer leaks into the others.
   * Resolved via `resolveStyleSettings(config, style)`.
   */
  styleSettings: z
    .object({
      oscilloscope: PerStyleSettingsSchema.optional(),
      "radial-spectrum": PerStyleSettingsSchema.optional(),
      "concentric-rings": PerStyleSettingsSchema.optional(),
      "stacked-waves": PerStyleSettingsSchema.optional(),
    })
    .optional(),

  /*
   * --- Legacy flat fields ----------------------------------------------------
   * These used to be the live values. They are now treated as a
   * "global override" applied to ANY style that hasn't customized that
   * field yet, so existing user configs keep their colors after the
   * per-style refactor. New writes always go into `styleSettings[style]`.
   */
  lineColor: z.string().optional(),
  glowColor: z.string().optional(),
  gridColor: z.string().optional(),
  lineWidth: z.number().min(1).max(12).optional(),
  sensitivity: z.number().min(0.5).max(5).optional(),
  showGrid: z.boolean().optional(),
  barCount: z.number().int().min(24).max(192).optional(),
  ringCount: z.number().int().min(2).max(24).optional(),
  ringSpeed: z.number().min(1).max(20).optional(),
  stackCount: z.number().int().min(6).max(48).optional(),

  /*
   * --- Truly global settings -------------------------------------------------
   */

  /**
   * Disable the soft glow pass and the per-bar gradient, and throttle the
   * draw loop to ~30fps. Massive win on Pi-class hardware where the canvas
   * `shadowBlur` operation is software-rasterized. Defaults to `true` since
   * the renderer normally runs on a Pi.
   */
  performanceMode: z.boolean().optional(),
  /** Preferred source. Persisted across sessions; user must still re-grant. */
  preferredSource: z.enum(["display", "microphone"]).optional(),
  ...OrientationFields,
});

export type VisualizerModuleConfig = z.infer<typeof VisualizerConfigSchema>;

export const DEFAULT_STYLE: VisualizerStyle = "oscilloscope";
export const DEFAULT_LINE_COLOR = "#22d3ee";
export const DEFAULT_GLOW_COLOR = "#67e8f9";
export const DEFAULT_GRID_COLOR = "#1e3a47";
export const DEFAULT_LINE_WIDTH = 3;
export const DEFAULT_SENSITIVITY = 1.5;
export const DEFAULT_BAR_COUNT = 96;
export const DEFAULT_RING_COUNT = 8;
export const DEFAULT_RING_SPEED = 6;
export const DEFAULT_STACK_COUNT = 24;
export const DEFAULT_PERFORMANCE_MODE = true;

/**
 * Resolved style settings — every field is required after merging defaults.
 * Drawing code consumes this shape.
 */
export type ResolvedStyleSettings = {
  lineColor: string;
  lineColor2: string;
  glowColor: string;
  gridColor: string;
  lineWidth: number;
  sensitivity: number;
  showGrid: boolean;
  barCount: number;
  ringCount: number;
  ringSpeed: number;
  stackCount: number;
};

/**
 * Per-style factory defaults. Each visual ships with its own color identity
 * so picking a style for the first time looks intentional rather than reusing
 * the previous style's palette.
 */
export const STYLE_DEFAULTS: Record<VisualizerStyle, ResolvedStyleSettings> = {
  oscilloscope: {
    lineColor: "#22d3ee",
    lineColor2: "#22d3ee",
    glowColor: "#67e8f9",
    gridColor: "#1e3a47",
    lineWidth: 3,
    sensitivity: 1.5,
    showGrid: true,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
  },
  "radial-spectrum": {
    lineColor: "#22d3ee",
    lineColor2: "#22d3ee",
    glowColor: "#f472b6",
    gridColor: "#1e3a47",
    lineWidth: 3,
    sensitivity: 1.5,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
  },
  "concentric-rings": {
    lineColor: "#fb923c",
    lineColor2: "#fb923c",
    glowColor: "#3b82f6",
    gridColor: "#1e3a47",
    lineWidth: 2,
    sensitivity: 1.5,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
  },
  "stacked-waves": {
    /*
     * White-at-top → cyan-at-bottom ridge by default, so the new
     * second-color field is immediately visible. Glow stays a dark grey
     * for the soft edge falloff.
     */
    lineColor: "#ffffff",
    lineColor2: "#22d3ee",
    glowColor: "#1c1c1c",
    gridColor: "#1e3a47",
    lineWidth: 2,
    sensitivity: 1.5,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
  },
};

/**
 * Resolve the effective settings for one visualizer style.
 *
 * Precedence (highest first):
 *  1. `config.styleSettings[style].X` — explicit per-style override.
 *  2. `config.X` — legacy flat field, treated as a "global override" so
 *     pre-refactor configs keep their look. Once a user customizes a
 *     field via the new UI it's stored in (1) and wins.
 *  3. `STYLE_DEFAULTS[style].X` — built-in default for this style.
 */
export function resolveStyleSettings(
  config: VisualizerModuleConfig,
  style: VisualizerStyle,
): ResolvedStyleSettings {
  const d = STYLE_DEFAULTS[style];
  const o = config.styleSettings?.[style] ?? {};

  // Per-style override wins, then legacy flat field, then style default.
  const pick = <T>(
    perStyle: T | undefined,
    legacy: T | undefined,
    fallback: T,
  ): T => (perStyle !== undefined ? perStyle : legacy ?? fallback);

  const result: ResolvedStyleSettings = {
    lineColor: pick(o.lineColor, config.lineColor, d.lineColor),
    // lineColor2 has no legacy counterpart on the flat config — it's a
    // new field, so we only consider the per-style override + default.
    lineColor2: o.lineColor2 !== undefined ? o.lineColor2 : d.lineColor2,
    glowColor: pick(o.glowColor, config.glowColor, d.glowColor),
    gridColor: pick(o.gridColor, config.gridColor, d.gridColor),
    lineWidth: pick(o.lineWidth, config.lineWidth, d.lineWidth),
    sensitivity: pick(o.sensitivity, config.sensitivity, d.sensitivity),
    showGrid: pick(o.showGrid, config.showGrid, d.showGrid),
    barCount: pick(o.barCount, config.barCount, d.barCount),
    ringCount: pick(o.ringCount, config.ringCount, d.ringCount),
    ringSpeed: pick(o.ringSpeed, config.ringSpeed, d.ringSpeed),
    stackCount: pick(o.stackCount, config.stackCount, d.stackCount),
  };

  return result;
}

/**
 * Wire shape for one visualizer frame.
 *
 *  - `samples` is the time-domain waveform used by the oscilloscope style.
 *    256 bytes, 128 = silence, 0/255 = extremes.
 *  - `freqs` is a log-spaced frequency-magnitude array (Uint8) for the
 *    radial-spectrum style. Lower indices = lower frequencies.
 *
 * Both are always populated so the renderer can switch styles at any time
 * without needing a fresh capture pipeline. ~256 + 128 = 384 bytes/frame,
 * ~23 KB/s at 60 Hz.
 *
 * The peak field is computed once on the desktop and reused by the renderer
 * to scale things like the line glow, avoiding an O(N) scan per frame.
 */
export type VisualizerStreamFrame = {
  samples: Uint8Array;
  freqs: Uint8Array;
  peak: number;
  sentAt: number;
};

export const WAVEFORM_SAMPLE_COUNT = 256;
export const FREQUENCY_BIN_COUNT = 128;
