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
 * Five fish species, deliberately varied in silhouette so a school of
 * six looks like a real ecosystem rather than six clones. Two-frame
 * wiggle on each — the difference between frames is intentionally
 * subtle (tail flip, fin shift) so the eye reads it as breathing, not
 * teleporting.
 *
 * Column alignment is sacred: every `\n`-separated row must have the
 * same visual width once rendered in a monospace font, or the body
 * will skew. Test changes by pasting into a monospace editor.
 */
export const FISH_SPECIES: FishSpecies[] = [
  // 1) Quick darter (small, 2 rows).
  {
    a: "    __\n>(((o>",
    b: "    __\n>((((o>",
    scale: 0.95,
  },
  // 2) Classic tropical (medium, 4 rows).
  {
    a: "   ___\n  / o \\___\n <      ===\n  \\___/",
    b: "   ___\n  / o \\__\n <      ==\n  \\___/",
    scale: 1.05,
  },
  // 3) Puffer-style with two "eyes" (medium-wide, 4 rows).
  {
    a: "    ____\n  /  o   \\\n  <      >>\n  \\______/",
    b: "    ____\n  /  o   \\\n  <      >\n  \\______/",
    scale: 1.15,
  },
  // 4) Long-tailed fish (medium, 4 rows).
  {
    a: "        __\n   ___/   \\\n  <  o    .)\n   \\___|/",
    b: "        __\n   ___/   \\\n  <  o    .)\n   \\___/",
    scale: 1.0,
  },
  // 5) Big chevron beast (large, 4 rows).
  {
    a: "    _____\n   (     \\\n  < o     )\n   (_____/",
    b: "    _____\n   (     /\n  < o     \\\n   (_____/",
    scale: 1.25,
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
