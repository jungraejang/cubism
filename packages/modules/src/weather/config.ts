import { z } from "zod";
import { OrientationFields } from "../_lib/orientation";

/** US ZIP: five digits, optional +4 extension (e.g. 90210 or 90210-1234). */
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

export const WeatherConfigSchema = z.object({
  /** US postal code passed to zippopotam.us for geocoding. */
  zipCode: z.string().regex(ZIP_PATTERN, "Enter a valid 5-digit US ZIP code"),
  /** Hex color for the weather icon and accent glow. */
  accentColor: z.string().optional(),
  /** Hex color for temperature and labels. */
  textColor: z.string().optional(),
  /** Hex color for secondary details (humidity, wind, condition). */
  detailColor: z.string().optional(),
  ...OrientationFields,
});

export type WeatherModuleConfig = z.infer<typeof WeatherConfigSchema>;

export const DEFAULT_ZIP_CODE = "10001";
export const DEFAULT_ACCENT_COLOR = "#22d3ee";
export const DEFAULT_TEXT_COLOR = "#67e8f9";
export const DEFAULT_DETAIL_COLOR = "#a5f3fc";

/** Normalize user input to the 5-digit form zippopotam expects. */
export function normalizeZipCode(zip: string): string {
  const digits = zip.replace(/\D/g, "");
  return digits.slice(0, 5);
}
