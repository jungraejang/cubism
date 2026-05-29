/**
 * Filled-spectrum visualizer ("frequency mountain").
 *
 * Draws the FFT magnitude curve as one smooth filled silhouette across
 * the canvas, with a vertical color gradient covering the whole canvas.
 * The shape acts as a mask — only the area under the curve is visible —
 * so taller peaks show off the upper part of the gradient (the
 * `lineColor`) while the calm baseline area shows mostly the lower part
 * (`lineColor2`).
 *
 * Source:
 *   - Frequency-domain magnitudes, mapped to X via the user-selected
 *     `frequencyLayout` (linear / linear-reverse / mirrored). Same
 *     mapping the stacked-waves style uses, so configurations feel
 *     consistent.
 *   - Per-x magnitudes are smoothed with a circular moving average to
 *     avoid spiky FFT noise on the silhouette outline.
 *   - Endpoints anchored gently to the baseline via a soft sine window
 *     so the fill closes cleanly at the canvas edges.
 *
 * Smoothness:
 *   - The top edge is drawn with the midpoint-quadratic Bezier trick
 *     (same as stacked-waves), so the silhouette flows rather than
 *     polygonal-zigzagging.
 *
 * Perf:
 *   - `performanceMode` lowers the X-step count and skips an inner
 *     highlight stroke, which is a fairly cheap savings for the Pi.
 *   - The fill is a single Path2D → `ctx.fill()`, so the per-frame cost
 *     is dominated by the gradient resolve, which canvas caches.
 */

export type DrawFilledSpectrumOptions = {
  width: number;
  height: number;
  /** Top color of the vertical gradient (covers the peaks). */
  lineColor: string;
  /** Bottom color of the vertical gradient (covers the baseline area). */
  lineColor2: string;
  /** Color of the optional outline stroke along the top edge. */
  glowColor: string;
  /** Color of the optional baseline guide line. */
  gridColor: string;
  /** Stroke width for the outline (if `showGrid` is true). */
  lineWidth: number;
  /** Amplitude multiplier (1 = neutral). */
  sensitivity: number;
  /** Whether to draw the outline stroke along the top of the silhouette. */
  showGrid: boolean;
  /** X-axis FFT mapping. See drawStackedWaves for the same set. */
  frequencyLayout: "mirrored" | "linear" | "linear-reverse";
  /** Skip extra prettiness for Pi-class hardware. */
  performanceMode?: boolean;
};

export function drawFilledSpectrum(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawFilledSpectrumOptions,
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
    frequencyLayout,
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  if (freqs.length === 0 || width <= 0 || height <= 0) return;

  const xSteps = performanceMode ? 96 : 160;
  const SMOOTH_WINDOW = performanceMode ? 3 : 4;

  // Baseline sits just above the bottom edge so the fill has room to
  // breathe even when nothing is playing.
  const baselineY = height * 0.98;
  // Peaks can rise up to this much off the baseline at full volume.
  const maxAmplitude = height * 0.88 * sensitivity;

  /*
   * Sample → smooth → window. We share the same pipeline shape as
   * stacked-waves so the two styles read the same way visually.
   */
  const rawV = new Float32Array(xSteps + 1);
  const xs = new Float32Array(xSteps + 1);
  const ys = new Float32Array(xSteps + 1);

  for (let s = 0; s <= xSteps; s++) {
    const xT = s / xSteps;
    xs[s] = xT * width;
    let t: number;
    if (frequencyLayout === "linear") {
      t = xT;
    } else if (frequencyLayout === "linear-reverse") {
      t = 1 - xT;
    } else {
      t = Math.abs(xT - 0.5) * 2;
    }
    const binIdx = Math.floor(t * (freqs.length - 1));
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
    // sin(πx)^0.4 — a fairly gentle window so most of the spectrum
    // remains visible, but the very edges still relax to the baseline.
    const xWindow = Math.pow(Math.sin(xT * Math.PI), 0.4);
    const lift = v * maxAmplitude * xWindow;
    ys[s] = baselineY - lift;
  }

  // Build the vertical gradient. Canvas caches gradient objects per ctx
  // by their colors / coords, so re-creating once per frame is fine.
  const gradient = ctx.createLinearGradient(0, 0, 0, baselineY);
  gradient.addColorStop(0, lineColor);
  gradient.addColorStop(1, lineColor2);

  /*
   * Build the silhouette path:
   *   - start at the baseline on the left
   *   - curve along the top via midpoint-quadratic Beziers
   *   - drop down to baseline on the right
   *   - close
   */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(xs[0], baselineY);
  ctx.lineTo(xs[0], ys[0]);

  let prevX = xs[0];
  let prevY = ys[0];
  for (let s = 1; s < xSteps; s++) {
    const curX = xs[s];
    const curY = ys[s];
    const midX = (prevX + curX) * 0.5;
    const midY = (prevY + curY) * 0.5;
    ctx.quadraticCurveTo(prevX, prevY, midX, midY);
    prevX = curX;
    prevY = curY;
  }
  // Last spline segment lands on the actual endpoint.
  ctx.quadraticCurveTo(prevX, prevY, xs[xSteps], ys[xSteps]);
  ctx.lineTo(xs[xSteps], baselineY);
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.fill();

  if (showGrid) {
    /*
     * Optional outline stroke along the top edge. Helps in low-contrast
     * gradients. Reuses the gradient fill so it stays color-aware.
     */
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    let pX = xs[0];
    let pY = ys[0];
    for (let s = 1; s < xSteps; s++) {
      const curX = xs[s];
      const curY = ys[s];
      const midX = (pX + curX) * 0.5;
      const midY = (pY + curY) * 0.5;
      ctx.quadraticCurveTo(pX, pY, midX, midY);
      pX = curX;
      pY = curY;
    }
    ctx.quadraticCurveTo(pX, pY, xs[xSteps], ys[xSteps]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Faint baseline guide so the user knows where "zero" sits.
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
  }

  ctx.restore();
}
