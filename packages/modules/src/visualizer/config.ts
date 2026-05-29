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
] as const;

export type VisualizerStyle =
  (typeof VISUALIZER_STYLE_OPTIONS)[number]["value"];

export const VisualizerConfigSchema = z.object({
  /** Which drawing routine to use on the renderer. */
  style: z.enum(["oscilloscope", "radial-spectrum"]).optional(),
  /**
   * Primary accent color. Per style:
   *  - oscilloscope: the waveform line itself.
   *  - radial-spectrum: the bar color at the inner base of each spoke.
   */
  lineColor: z.string().optional(),
  /**
   * Secondary accent color. Per style:
   *  - oscilloscope: the soft halo under the line.
   *  - radial-spectrum: the bar color at the outer tip (creates a gradient
   *    from `lineColor` at the base to `glowColor` at the tip).
   */
  glowColor: z.string().optional(),
  /** Grid lines (oscilloscope) / inner radius outline (radial). */
  gridColor: z.string().optional(),
  /** Stroke thickness in CSS pixels. */
  lineWidth: z.number().min(1).max(12).optional(),
  /** Amplification multiplier (1 = neutral). */
  sensitivity: z.number().min(0.5).max(5).optional(),
  /** Whether to draw any helper grid / outlines. */
  showGrid: z.boolean().optional(),
  /** Number of spokes for the radial-spectrum style. */
  barCount: z.number().int().min(24).max(192).optional(),
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
