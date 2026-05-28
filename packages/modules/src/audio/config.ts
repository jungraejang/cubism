import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

export const AUDIO_SOURCE_OPTIONS = [
  { value: "display", label: "System / Tab audio" },
  { value: "microphone", label: "Microphone" },
] as const;

export type AudioSource = (typeof AUDIO_SOURCE_OPTIONS)[number]["value"];

export const AudioConfigSchema = z.object({
  /** Hex color for the oscilloscope line. */
  lineColor: z.string().optional(),
  /** Hex color for the soft glow under the line. */
  glowColor: z.string().optional(),
  /** Hex color for the secondary grid lines / labels. */
  gridColor: z.string().optional(),
  /** Line thickness in CSS pixels. */
  lineWidth: z.number().min(1).max(12).optional(),
  /** Vertical amplification (1 = neutral). */
  sensitivity: z.number().min(0.5).max(5).optional(),
  /** Whether to draw a faint grid behind the waveform. */
  showGrid: z.boolean().optional(),
  /** Preferred source. Persisted across sessions; user must still re-grant. */
  preferredSource: z.enum(["display", "microphone"]).optional(),
  ...OrientationFields,
});

export type AudioModuleConfig = z.infer<typeof AudioConfigSchema>;

export const DEFAULT_LINE_COLOR = "#22d3ee";
export const DEFAULT_GLOW_COLOR = "#67e8f9";
export const DEFAULT_GRID_COLOR = "#1e3a47";
export const DEFAULT_LINE_WIDTH = 3;
export const DEFAULT_SENSITIVITY = 1.5;

/**
 * Wire shape for one waveform frame. Sample values are normalized to
 * [-1, 1] but encoded as bytes [0, 255] (128 = silence) so each frame is just
 * a 256-byte Uint8Array, ~7.5KB/s at 30fps.
 *
 * The peak field is computed once on the desktop and reused by the renderer
 * to scale the line glow, avoiding an O(N) scan per frame.
 */
export type AudioStreamFrame = {
  samples: Uint8Array;
  peak: number;
  sentAt: number;
};

export const WAVEFORM_SAMPLE_COUNT = 256;
