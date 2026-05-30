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
  { value: "filled-spectrum", label: "Filled spectrum" },
  { value: "pixel-bars", label: "Pixel bars" },
  { value: "fractal", label: "Fractal feedback" },
  { value: "orbit-arcs", label: "Orbit arcs" },
  { value: "plasma", label: "Plasma" },
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
  /**
   * X-axis FFT mapping for `stacked-waves`. Ignored by other styles.
   * See `frequencyLayout` on the resolved settings type for details.
   */
  frequencyLayout: z.enum(["mirrored", "linear", "linear-reverse"]).optional(),
  /**
   * Strength of the "fade to black" overlay applied to the bottom of the
   * filled-spectrum silhouette so it blends into the surrounding canvas.
   * 0 = no fade, 1 = entire fill height fades to black at the baseline.
   * Used only by `filled-spectrum`; other styles ignore.
   */
  bottomFade: z.number().min(0).max(1).optional(),
  /**
   * Number of cells stacked vertically in each `pixel-bars` column. The
   * bar's magnitude lights up that many cells from the bottom. Other
   * styles ignore this field.
   */
  cellRows: z.number().int().min(4).max(48).optional(),
  /**
   * Strength of the soft "fade to black" radial vignette overlay drawn
   * on top of the rendered style. 0 = no vignette (style fills edge to
   * edge); 1 = aggressive fade starting near the center. Useful for
   * styles that paint full-frame color (plasma, fractal) to hide the
   * hard rectangular canvas edges and blend into the surrounding
   * black. Currently honored by the plasma style only.
   */
  vignette: z.number().min(0).max(1).optional(),
  /**
   * Scale factor for the plasma triangle clip (0.3 — 1.0). 1.0 = the
   * largest equilateral triangle that fits the canvas; smaller values
   * shrink it about the canvas center, leaving more black around it.
   * Only the plasma style consumes this field today.
   */
  triangleSize: z.number().min(0.3).max(1).optional(),
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
      "filled-spectrum",
      "pixel-bars",
      "fractal",
      "orbit-arcs",
      "plasma",
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
      "filled-spectrum": PerStyleSettingsSchema.optional(),
      "pixel-bars": PerStyleSettingsSchema.optional(),
      fractal: PerStyleSettingsSchema.optional(),
      "orbit-arcs": PerStyleSettingsSchema.optional(),
      plasma: PerStyleSettingsSchema.optional(),
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
export const DEFAULT_CELL_ROWS = 16;
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
  frequencyLayout: "mirrored" | "linear" | "linear-reverse";
  bottomFade: number;
  cellRows: number;
  vignette: number;
  triangleSize: number;
};

export const FREQUENCY_LAYOUT_OPTIONS = [
  { value: "mirrored", label: "Mirrored (bass center)" },
  { value: "linear", label: "Linear (bass → treble)" },
  { value: "linear-reverse", label: "Linear reverse (treble → bass)" },
] as const;

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
    frequencyLayout: "mirrored",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
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
    frequencyLayout: "mirrored",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
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
    frequencyLayout: "mirrored",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
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
    frequencyLayout: "mirrored",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
  },
  "filled-spectrum": {
    /*
     * Sunset palette: yellow at the peak → pink at the baseline. The fill
     * IS the visualization (no outline drawn by default), so the user
     * picks the gradient endpoints via lineColor (top) and lineColor2
     * (bottom). Spectrum is laid out left-to-right by default.
     */
    lineColor: "#facc15",
    lineColor2: "#ec4899",
    glowColor: "#22d3ee",
    gridColor: "#1e3a47",
    lineWidth: 2,
    sensitivity: 1.8,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
    frequencyLayout: "linear",
    bottomFade: 0.45,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
  },
  "pixel-bars": {
    /*
     * Classic LED-equalizer palette. HSL interpolation between these two
     * endpoints flows through cyan-blue in the middle so the gradient
     * reads as a rainbow ramp rather than a muddy RGB lerp.
     */
    lineColor: "#34d399",
    lineColor2: "#d946ef",
    glowColor: "#22d3ee",
    gridColor: "#1e3a47",
    lineWidth: 1,
    sensitivity: 1.6,
    showGrid: false,
    barCount: 32,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
    frequencyLayout: "linear",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
  },
  fractal: {
    /*
     * Winamp/MilkDrop-style frame-feedback fractal. `lineColor` anchors
     * the saturation/lightness of the hue-cycled audio curve; the actual
     * hue rotates over time (slowly by default, faster on bass hits) so
     * the visual feels alive. `lineColor2` is unused for now but kept in
     * the schema for symmetry; `glowColor` drives the soft shadow halo
     * around the freshly-drawn waveform in non-performance mode.
     */
    lineColor: "#e879f9",
    lineColor2: "#7e22ce",
    glowColor: "#a855f7",
    gridColor: "#1e3a47",
    lineWidth: 2,
    sensitivity: 1.5,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: DEFAULT_RING_SPEED,
    stackCount: DEFAULT_STACK_COUNT,
    frequencyLayout: "linear",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
  },
  "orbit-arcs": {
    /*
     * Concentric glowing arcs at offset rotations. `lineColor` →
     * `lineColor2` is the outer-to-inner palette gradient (sampled in
     * HSL so the ramp reads as a hue sweep, not a muddy RGB lerp);
     * `glowColor` is the shadow halo on each arc in non-perf mode. The
     * innermost arc paints itself with a rainbow conic gradient that
     * spins with the arc, which is why it looks like a multicolor
     * sliver in the reference screenshot. `ringCount` doubles as
     * "arc count"; `ringSpeed` is the base angular speed (deg/sec)
     * before per-arc variance and audio modulation.
     */
    lineColor: "#ef4444",
    lineColor2: "#22c55e",
    glowColor: "#a855f7",
    gridColor: "#1e3a47",
    lineWidth: 6,
    sensitivity: 1.4,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: 4,
    ringSpeed: 6,
    stackCount: DEFAULT_STACK_COUNT,
    frequencyLayout: "linear",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    vignette: 0,
    triangleSize: 1,
  },
  plasma: {
    /*
     * Demo-scene cosine plasma. The pixel color at (x,y,t) is the sum
     * of a handful of sin terms folded through a precomputed palette
     * LUT — classic 90s graphics-card warmup vibe. `lineColor` →
     * `glowColor` → `lineColor2` is a 3-stop gradient that fills the
     * 256-entry LUT (HSL-interpolated for smooth hue transitions). The
     * pattern always advances; bass speeds up the linear flow, treble
     * speeds up the radial ripples, so the vibe shifts with the music.
     * `ringSpeed` is reused as the base time-advance rate; nothing
     * else from the schema applies to this style.
     */
    lineColor: "#06b6d4",
    lineColor2: "#f43f5e",
    glowColor: "#a78bfa",
    gridColor: "#1e3a47",
    lineWidth: 1,
    sensitivity: 1.2,
    showGrid: false,
    barCount: DEFAULT_BAR_COUNT,
    ringCount: DEFAULT_RING_COUNT,
    ringSpeed: 5,
    stackCount: DEFAULT_STACK_COUNT,
    frequencyLayout: "linear",
    bottomFade: 0,
    cellRows: DEFAULT_CELL_ROWS,
    /*
     * Plasma uses a hard-edged equilateral triangle clip (see
     * drawPlasma.ts) instead of a soft vignette, so this field is
     * unused for the plasma style today. Kept at 0 in case we ever
     * compose the two effects.
     */
    vignette: 0,
    triangleSize: 1,
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
  ): T => (perStyle !== undefined ? perStyle : (legacy ?? fallback));

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
    frequencyLayout:
      o.frequencyLayout !== undefined ? o.frequencyLayout : d.frequencyLayout,
    bottomFade: o.bottomFade !== undefined ? o.bottomFade : d.bottomFade,
    // cellRows has no legacy flat-field counterpart — new field added
    // with the pixel-bars style.
    cellRows: o.cellRows !== undefined ? o.cellRows : d.cellRows,
    // vignette has no legacy counterpart either; per-style override
    // or per-style default only.
    vignette: o.vignette !== undefined ? o.vignette : d.vignette,
    // triangleSize is plasma-only and has no legacy field.
    triangleSize:
      o.triangleSize !== undefined ? o.triangleSize : d.triangleSize,
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
