import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

/**
 * Base font-size options. Values are CSS `vmin` units so the text scales
 * naturally to the renderer's display regardless of resolution.
 */
export const FONT_SIZE_OPTIONS = [
  { value: "sm", label: "Small", vmin: 3.5 },
  { value: "md", label: "Medium", vmin: 5 },
  { value: "lg", label: "Large", vmin: 7 },
  { value: "xl", label: "Extra large", vmin: 9 },
  { value: "2xl", label: "Huge", vmin: 12 },
] as const;

export type FontSize = (typeof FONT_SIZE_OPTIONS)[number]["value"];

export const TextConfigSchema = z.object({
  /**
   * Rich-text content as HTML. Sanitized on the renderer before being
   * inserted into the DOM, so this is safe to round-trip over the socket
   * even from an untrusted source.
   */
  html: z.string(),
  /** Base font size for the whole block. Per-block sizing comes from headings. */
  fontSize: z.enum(["sm", "md", "lg", "xl", "2xl"]),
  /** Fallback text color, applied when the editor hasn't set inline colors. */
  textColor: z.string(),
  /** Optional CSS background tint behind the text. Empty string = transparent black. */
  bgColor: z.string().optional(),
  ...OrientationFields,
});

export type TextModuleConfig = z.infer<typeof TextConfigSchema>;

export const DEFAULT_TEXT_COLOR = "#67e8f9";
export const DEFAULT_BG_COLOR = "";

export const DEFAULT_TEXT_HTML =
  '<p>Welcome to <strong>Cubism</strong>. Type anything here.</p>';

export function fontSizeToVmin(size: FontSize): number {
  return FONT_SIZE_OPTIONS.find((o) => o.value === size)?.vmin ?? 5;
}
