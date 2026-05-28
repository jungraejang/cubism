import { z } from "zod";

/**
 * Shared orientation fields for modules that render on a beam-splitter.
 * Compose into a module's config schema with `.extend(OrientationFields)` or
 * spread `OrientationFields.shape` into a `z.object({...})`.
 */
export const OrientationFields = {
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
  flipHorizontal: z.boolean().optional(),
  flipVertical: z.boolean().optional(),
};

export type ModuleRotation = 0 | 90 | 180 | 270;

export type Orientation = {
  rotation?: ModuleRotation;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
};

export const ROTATION_OPTIONS: { value: ModuleRotation; label: string }[] = [
  { value: 0, label: "Normal" },
  { value: 90, label: "Right" },
  { value: 180, label: "Upside down" },
  { value: 270, label: "Left" },
];

/**
 * Computes the CSS transform values for a given orientation. Returns the raw
 * numeric fields so callers can hand them directly to framer-motion's `animate`
 * prop (which animates each field independently).
 */
export function orientationTransform(o: Orientation): {
  rotate: number;
  scaleX: -1 | 1;
  scaleY: -1 | 1;
} {
  return {
    rotate: o.rotation ?? 0,
    scaleX: o.flipHorizontal ? -1 : 1,
    scaleY: o.flipVertical ? -1 : 1,
  };
}
