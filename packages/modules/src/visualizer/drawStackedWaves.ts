/**
 * Stacked-waves visualizer ("ridge plot" style).
 *
 * Draws N horizontal lines evenly stacked vertically across the canvas.
 * Every line traces the same source curve sampled across X, but the
 * displacement that line is allowed to make away from its baseline is
 * scaled by a vertical bell envelope — so the middle lines spike upward
 * dramatically while the top and bottom lines stay nearly flat. The
 * result is the "mountain ridge" silhouette where multiple lines cluster
 * around the same peak shape.
 *
 * Source curve:
 *   - We use the frequency spectrum, mirrored around the horizontal
 *     center: x=0 and x=width sample the highest freq bin, x=width/2
 *     samples the lowest (bass). Most musical content has the bulk of
 *     its energy in the bass, so the natural shape becomes a smooth
 *     centered peak — matching the screenshot.
 *   - A sine window (sin(πx))^0.6 forces the displacement to zero at
 *     the canvas edges, so lines start and end on their baseline.
 *
 * Color:
 *   - Lines closer to the vertical center fade from `glowColor` (outer)
 *     toward `lineColor` (center). Their alpha also rises so the peak
 *     ridge feels brighter than the calm edges.
 *
 * Smoothness:
 *   - Lines are drawn as quadratic-Bezier splines using the classic
 *     "midpoint" technique (each sample point becomes a control point,
 *     the curve actually passes through the midpoint between consecutive
 *     samples). That eliminates the polyline kinks lineTo gives you.
 *   - Before drawing, the per-x displacement values are pre-smoothed with
 *     a circular-buffered moving average. This removes the spiky FFT
 *     jitter and gives the soft, flowing curves from the reference image.
 *
 * Perf:
 *   - `performanceMode` cuts the per-line resolution and disables the
 *     alpha falloff (constant alpha 1.0). With the smoothing pass we can
 *     use FEWER x-steps than the linear version and still look great,
 *     since the Bezier interpolates between them — so performance mode
 *     is actually cheaper than the original linear implementation.
 */

export type DrawStackedWavesOptions = {
  width: number;
  height: number;
  /** Color of the ridge peak at the TOP of the canvas. */
  lineColor: string;
  /**
   * Color of the ridge peak at the BOTTOM of the canvas. Each row's
   * "line color" is a vertical lerp from `lineColor` (top) to `lineColor2`
   * (bottom), so the peak gains a gradient instead of being a single hue.
   * Pass the same color as `lineColor` to get a flat-color peak.
   */
  lineColor2: string;
  /** Color of lines at the top/bottom EDGES (symmetric, as before). */
  glowColor: string;
  /** Color of the optional horizontal center guide line. */
  gridColor: string;
  /** Stroke width in CSS pixels. */
  lineWidth: number;
  /** Amplitude multiplier (1 = neutral). */
  sensitivity: number;
  /** Whether to draw a faint horizontal center guide. */
  showGrid: boolean;
  /** Number of stacked lines. */
  lineCount: number;
  /** Skip extra prettiness for Pi-class hardware. */
  performanceMode?: boolean;
};

export function drawStackedWaves(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawStackedWavesOptions,
): void {
  const {
    width,
    height,
    lineColor,
    lineColor2,
    glowColor,
    gridColor,
    lineWidth,
    sensitivity,
    showGrid,
    lineCount,
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  if (lineCount <= 0) return;

  const verticalPad = height * 0.06;
  const usableHeight = height - 2 * verticalPad;
  const lineGap =
    lineCount === 1 ? 0 : usableHeight / (lineCount - 1);
  const maxDisplacement = height * 0.45 * sensitivity;

  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
  }

  if (freqs.length === 0) return;

  /*
   * Bezier interpolation makes us much less sensitive to step count —
   * the curve fills in detail between samples. 128 steps full / 80 perf
   * is plenty to capture every meaningful bump.
   */
  const xSteps = performanceMode ? 80 : 128;
  const lineTopRgb = hexToRgb(lineColor);
  const lineBottomRgb = hexToRgb(lineColor2);
  const glowRgb = hexToRgb(glowColor);

  /*
   * Pre-smooth the per-x displacement. Raw FFT bins are noisy, and
   * stacking a noisy curve N times exaggerates every spike. A wider
   * moving-average gives the flowing, organic curves from the reference.
   */
  const SMOOTH_WINDOW = performanceMode ? 3 : 4;
  const rawV = new Float32Array(xSteps + 1);
  const offsets = new Float32Array(xSteps + 1);
  const xs = new Float32Array(xSteps + 1);

  for (let s = 0; s <= xSteps; s++) {
    const xT = s / xSteps; // 0..1
    xs[s] = xT * width;
    const mirrored = Math.abs(xT - 0.5) * 2; // 0 at center, 1 at edges
    const binIdx = Math.floor(mirrored * (freqs.length - 1));
    rawV[s] = freqs[binIdx] / 255;
  }

  for (let s = 0; s <= xSteps; s++) {
    let sum = 0;
    let count = 0;
    for (let k = -SMOOTH_WINDOW; k <= SMOOTH_WINDOW; k++) {
      const idx = s + k;
      if (idx < 0 || idx > xSteps) continue;
      sum += rawV[idx];
      count++;
    }
    const v = sum / count;
    const xT = s / xSteps;
    const xWindow = Math.pow(Math.sin(xT * Math.PI), 0.6);
    // offsets[s] is the unit displacement at this x (independent of line).
    offsets[s] = v * xWindow;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;

  for (let i = 0; i < lineCount; i++) {
    const t = lineCount === 1 ? 0.5 : i / (lineCount - 1); // 0 top → 1 bottom
    const yBase = verticalPad + t * usableHeight;

    // Bell envelope: 1 at vertical center, 0 at top/bottom. Squared
    // falloff gives the soft mountain shape from the screenshot.
    const centerDist = Math.abs(t - 0.5) * 2;
    const envelope = Math.pow(1 - centerDist, 1.6);

    /*
     * Per-row peak color: lerp(lineTop, lineBottom, t). So the top row's
     * peak uses `lineColor`, the bottom row's peak uses `lineColor2`, and
     * everything between is a smooth blend. Then the envelope-based lerp
     * from glow toward that per-row peak handles the soft fade into the
     * edges, preserving the original glow behavior exactly.
     */
    const perRowPeak = lerpRgbObj(lineTopRgb, lineBottomRgb, t);
    ctx.strokeStyle = lerpRgb(glowRgb, perRowPeak, envelope);
    ctx.globalAlpha = performanceMode ? 1 : 0.35 + 0.65 * envelope;

    const lineAmp = envelope * maxDisplacement;
    if (lineAmp < 0.5) {
      // Line would be effectively flat — draw a single horizontal
      // segment and skip the per-step loop entirely. Avoids burning
      // CPU on invisible work.
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      ctx.lineTo(width, yBase);
      ctx.stroke();
      continue;
    }

    /*
     * Smooth polyline via midpoint quadratic Beziers.
     *   - Start at sample 0.
     *   - For each i in [0, N-2], draw a quadratic with the sample at i
     *     as the control point and the midpoint between i and i+1 as the
     *     endpoint. The result passes smoothly through every midpoint
     *     with each vertex pulling the curve into a soft bend.
     *   - Close with a final lineTo to sample N to land cleanly on the
     *     last point.
     */
    const y0 = yBase - offsets[0] * lineAmp;
    ctx.beginPath();
    ctx.moveTo(xs[0], y0);

    let prevX = xs[0];
    let prevY = y0;
    for (let s = 1; s < xSteps; s++) {
      const curX = xs[s];
      const curY = yBase - offsets[s] * lineAmp;
      const midX = (prevX + curX) * 0.5;
      const midY = (prevY + curY) * 0.5;
      ctx.quadraticCurveTo(prevX, prevY, midX, midY);
      prevX = curX;
      prevY = curY;
    }
    // Final segment to the last sample.
    const lastX = xs[xSteps];
    const lastY = yBase - offsets[xSteps] * lineAmp;
    ctx.quadraticCurveTo(prevX, prevY, lastX, lastY);
    ctx.stroke();
  }

  ctx.restore();
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  if (hex.startsWith("rgb")) {
    const m = hex.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = Number.parseInt(h, 16);
  if (!Number.isFinite(num)) return { r: 255, g: 255, b: 255 };
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function lerpRgb(a: Rgb, b: Rgb, t: number): string {
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

/** RGB lerp returning the Rgb object (no string allocation). */
function lerpRgbObj(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
