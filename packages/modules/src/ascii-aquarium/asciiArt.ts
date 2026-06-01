/**
 * Static ASCII shape library for the aquarium.
 *
 * Fish are stored as "species" with TWO frames each (`a` / `b`) that the
 * renderer alternates between for a body wiggle. Strings contain `\n`
 * newlines and render as multi-line ASCII art via a monospace `<pre>`
 * inside drei's `<Html>` — that's what gives the screenshot's
 * "detailed fish" look vs. the previous single-line `><(((°>` style.
 *
 * Every shape is authored RIGHT-FACING. When a fish swims left, we
 * mirror its wrapping element with CSS `scaleX(-1)` rather than
 * maintaining a separate left-facing string per species. That keeps
 * the art table half its size and stays in sync automatically.
 */

export type FishSpecies = {
  /** Frame A — default body pose. */
  a: string;
  /** Frame B — slight variation; swapped in every WIGGLE_PERIOD_MS. */
  b: string;
  /**
   * Relative scale multiplier vs the renderer's base font size. Bigger
   * species feel "closer" / more prominent regardless of z-position;
   * smaller species (minnows) read as background fish.
   */
  scale: number;
};

/**
 * Single-line fish in the classic `<º)))><` style. All shapes are
 * authored RIGHT-FACING — e.g. `><(((º>` — and CSS-mirrored at runtime
 * when a fish swims left, at which point the rendered glyphs flip into
 * `<º)))><` (the user-facing form).
 *
 * Each species varies the body length so a school reads as a mix of
 * small/medium/large fish without needing different art directions.
 * The two wiggle frames flip the body parens between `(` and `)` to
 * suggest a side-to-side tail flick — the classic ASCII fish
 * swim animation.
 */
export const FISH_SPECIES: FishSpecies[] = [
  // 1) Small minnow.
  {
    a: "><(º>",
    b: "><)º>",
    scale: 0.95,
  },
  // 2) Standard fish — the user's requested `<º)))><` shape (right-facing).
  {
    a: "><(((º>",
    b: "><)))º>",
    scale: 1.05,
  },
  // 3) Long-bodied fish.
  {
    a: "><(((((º>",
    b: "><)))))º>",
    scale: 1.15,
  },
  // 4) Stubby pufferfish — same shape, different proportions.
  {
    a: "><((º>",
    b: "><))º>",
    scale: 1.0,
  },
  // 5) Extra-long eel-like fish.
  {
    a: "><(((((((º>",
    b: "><)))))))º>",
    scale: 1.2,
  },
];

/**
 * Vibrant color palette assigned per-fish (index modulo). Picked to
 * pop against a dark teal aquarium background and to read distinctly
 * from one another at hologram size. Cyan first since it's also the
 * default `fishColor` config value — if the user dials the palette
 * down later we can have one fall back to that.
 */
export const FISH_PALETTE = [
  "#22d3ee", // cyan-400
  "#a3e635", // lime-400
  "#f59e0b", // amber-500
  "#ec4899", // pink-500
  "#facc15", // yellow-400
  "#f43f5e", // rose-500
];

/**
 * How many ms between wiggle frame swaps. Each fish offsets this by
 * its own per-instance phase so the school doesn't tick in unison.
 */
export const WIGGLE_PERIOD_MS = 260;

/**
 * Seaweed stalks. Each entry is a multi-line ASCII string rendered as
 * ONE `<Html>` element per stalk (cheaper than one per row, and the
 * sway is applied to the whole stalk via CSS `skewY`). The built-in
 * wavy pattern in each shape already reads as "swaying kelp" before
 * any animation kicks in — the JS-driven skewY just adds slow life.
 */
export const SEAWEED_SPECIES: string[] = [
  // Curling leaf.
  " (\n)\n (\n)\n (\n)\n (",
  // Reverse curl.
  ")\n (\n)\n (\n)\n (\n)",
  // Curly bracket vine.
  "}\n {\n}\n {\n}\n {\n}",
  // Zig-zag kelp.
  " /\n\\\n /\n\\\n /\n\\\n /",
];

/**
 * Bubble glyphs in size order. Bigger glyphs render at closer z values
 * to reinforce depth before perspective scaling even kicks in.
 */
export const BUBBLE_GLYPHS = ["·", "o", "O"];
