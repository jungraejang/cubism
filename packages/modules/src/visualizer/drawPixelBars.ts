/**
 * Pixel-bars / LED-equalizer visualizer.
 *
 * Each FFT bar is rendered as a vertical stack of small cells (think
 * LED VU-meter). The bar's magnitude lights N cells from the bottom; an
 * HSL hue gradient runs top→bottom across the cells so a tall bar shows
 * a rainbow column while a quiet bar shows only the warm bottom hues.
 *
 * Why HSL interpolation rather than RGB:
 *   The reference look (green/teal at top, cyan in the middle, magenta
 *   at the bottom) only works if the gradient *rotates through hues*.
 *   RGB-lerping green to magenta passes through grey/brown — wrong feel.
 *   HSL lerping (shorter hue arc) flows through cyan/blue naturally, so
 *   the user only has to pick two endpoint colors and the cool/warm
 *   midtones emerge for free.
 *
 * Perf notes:
 *   - Row colors are precomputed once per frame (cellRows ≤ 48), so the
 *     hot inner loop is just `fillStyle = cachedString; fillRect(...)`.
 *   - We only paint the lit cells (no draw calls for dark cells) which
 *     means a quiet moment costs almost nothing on the Pi.
 *   - Canvas accepts the `hsl(h, s%, l%)` string directly, so we skip
 *     the HSL→RGB conversion entirely.
 */

export type DrawPixelBarsOptions = {
  width: number;
  height: number;
  /** Color of the TOP row's LEDs. */
  lineColor: string;
  /** Color of the BOTTOM row's LEDs. */
  lineColor2: string;
  /** Unused for now — kept for option-shape symmetry across styles. */
  glowColor: string;
  /** Color of the optional column-divider guides. */
  gridColor: string;
  /** Unused — pixel-bars has no stroked elements. */
  lineWidth: number;
  /** Amplitude multiplier (1 = neutral). */
  sensitivity: number;
  /** Whether to draw faint dark cells for the unlit positions. */
  showGrid: boolean;
  /** Number of columns. */
  barCount: number;
  /** Number of cells stacked vertically per column. */
  cellRows: number;
  /** X-axis FFT mapping. Same set as other spectrum styles. */
  frequencyLayout: "mirrored" | "linear" | "linear-reverse";
  /** Skip extra prettiness for Pi-class hardware. */
  performanceMode?: boolean;
};

// Proportion of cell size used as inter-cell gap. 0.18 ≈ classic LED look.
const CELL_GAP_RATIO = 0.18;

export function drawPixelBars(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawPixelBarsOptions,
): void {
  const {
    width,
    height,
    lineColor,
    lineColor2,
    gridColor,
    sensitivity,
    showGrid,
    barCount,
    cellRows,
    frequencyLayout,
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  if (
    freqs.length === 0 ||
    barCount <= 0 ||
    cellRows <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return;
  }

  // Cell geometry. We carve the canvas into equal-sized "slots" then
  // subtract a proportional gap from each slot to get the cell's
  // drawable rect. This keeps the lit columns visually aligned even
  // when bar/cell counts change.
  const colSlot = width / barCount;
  const rowSlot = height / cellRows;
  const cellGapX = colSlot * CELL_GAP_RATIO;
  const cellGapY = rowSlot * CELL_GAP_RATIO;
  const cellWidth = Math.max(1, colSlot - cellGapX);
  const cellHeight = Math.max(1, rowSlot - cellGapY);

  // Precompute per-row colors using HSL hue interpolation.
  const topHsl = hexToHsl(lineColor);
  const botHsl = hexToHsl(lineColor2);
  const rowColors = new Array<string>(cellRows);
  // Optional dimmer-tinted versions for the unlit "dark cells" when
  // `showGrid` is on — same hue, much lower lightness.
  const darkRowColors = showGrid ? new Array<string>(cellRows) : null;
  for (let r = 0; r < cellRows; r++) {
    const t = cellRows === 1 ? 0 : r / (cellRows - 1);
    const c = lerpHsl(topHsl, botHsl, t);
    rowColors[r] = `hsl(${c.h.toFixed(1)},${c.s.toFixed(1)}%,${c.l.toFixed(1)}%)`;
    if (darkRowColors) {
      // 10% lightness, low saturation — enough to hint at the LED
      // outline without competing with the lit cells.
      darkRowColors[r] = `hsl(${c.h.toFixed(1)},${Math.min(c.s, 35).toFixed(1)}%,10%)`;
    }
  }

  /*
   * Optionally paint the dark "unlit" cells first so the active cells
   * land on top. Cheap because we batch by row color (one fillStyle
   * change per row).
   */
  if (showGrid && darkRowColors) {
    for (let r = 0; r < cellRows; r++) {
      ctx.fillStyle = darkRowColors[r];
      const y = r * rowSlot;
      for (let b = 0; b < barCount; b++) {
        const x = b * colSlot;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }
  }

  // For each bar: figure out lit count, paint lit cells from the bottom.
  // We loop bars-then-cells (rather than row-major) because each bar's
  // litCount is independent. Performance is fine — fillStyle changes
  // are batched within a column.
  for (let b = 0; b < barCount; b++) {
    const xT = barCount === 1 ? 0.5 : b / (barCount - 1);
    let layoutT: number;
    if (frequencyLayout === "linear") {
      layoutT = xT;
    } else if (frequencyLayout === "linear-reverse") {
      layoutT = 1 - xT;
    } else {
      layoutT = Math.abs(xT - 0.5) * 2;
    }
    const binIdx = Math.floor(layoutT * (freqs.length - 1));
    const magnitude = (freqs[binIdx] / 255) * sensitivity;
    const litCount = Math.min(cellRows, Math.round(magnitude * cellRows));
    if (litCount <= 0) continue;

    const x = b * colSlot;
    // Light from the bottom up. Cell at rowIdx=cellRows-1 sits at the
    // bottom of the canvas; we walk upward until we've drawn litCount.
    for (let i = 0; i < litCount; i++) {
      const rowIdx = cellRows - 1 - i;
      ctx.fillStyle = rowColors[rowIdx];
      const y = rowIdx * rowSlot;
      ctx.fillRect(x, y, cellWidth, cellHeight);
    }
  }

  // High-fidelity polish: a faint baseline guide under the bars.
  if (showGrid && !performanceMode) {
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  // Accepts "#rgb", "#rrggbb", or already-rgb strings.
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return { h: 0, s: 0, l: 50 };
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return { h: hue, s: s * 100, l: l * 100 };
}

function lerpHsl(a: Hsl, b: Hsl, t: number): Hsl {
  // Pick the shorter arc around the color wheel so two warm endpoints
  // don't wander through grey just to "reach" each other the long way.
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  return {
    h: (a.h + dh * t + 360) % 360,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}
