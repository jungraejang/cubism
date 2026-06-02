/**
 * Pixel-art sprite library for the aquarium's "pixel" style.
 *
 * These are 8-bit / 48×48 PNG sprites served as static files from the
 * renderer app's `public/aquarium/` folder. They are an alternative to the
 * ASCII glyph library in `asciiArt.ts`; the renderer swaps between the two
 * based on the `style` config field.
 *
 * Performance: every sprite is a tiny square PNG drawn at a fixed CSS size
 * with `image-rendering: pixelated`, so the Pi never has to upscale/filter a
 * large bitmap. Motion is driven by the same lightweight CSS transitions /
 * keyframes the ASCII style uses — no WebGL, no per-frame JS layout.
 */

/** Base path the renderer serves these from (apps/renderer/public). */
const BASE = "/aquarium";

export type PixelFishSprite = {
  src: string;
  /**
   * Direction the source art naturally points. The renderer flips the
   * sprite with CSS `scaleX` so it always faces its travel direction; this
   * tells it whether a flip is needed for a given heading. Flip a value here
   * if a species ever swims "backwards".
   */
  faceRight: boolean;
  /** Relative size multiplier vs the renderer's base pixel-fish size. */
  scale: number;
};

/**
 * Fish sprites. All sprites are square (48×48); `scale` only changes the
 * on-screen size so a school reads as a mix of small/large fish.
 */
export const PIXEL_FISH: PixelFishSprite[] = [
  { src: `${BASE}/fish_yellow.gif`, faceRight: false, scale: 1.15 },
  { src: `${BASE}/fish-nemo.png`, faceRight: false, scale: 0.95 },
  { src: `${BASE}/fish-karp.png`, faceRight: true, scale: 1.1 },
  { src: `${BASE}/fish-goldfish.png`, faceRight: true, scale: 1.0 },
];

/** Seaweed sprites, anchored at the bottom and swayed with CSS skew. */
export const PIXEL_SEAWEED: string[] = [
  `${BASE}/seaweed-1.png`,
  `${BASE}/seaweed-2.png`,
  `${BASE}/seaweed-3.png`,
  `${BASE}/seaweed-4.png`,
];

/** Single bubble sprite, scaled per-instance for size variety. */
export const PIXEL_BUBBLE = `${BASE}/bubble.png`;
