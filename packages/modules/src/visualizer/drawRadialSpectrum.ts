/**
 * Shared canvas drawing routine for the radial-spectrum visualizer.
 * Bars are arranged around a circle, length proportional to each
 * (log-spaced) frequency bucket's magnitude. The bar color gradient runs
 * from `lineColor` at the inner base to `glowColor` at the outer tip.
 *
 * The drawer is style-agnostic about its caller — same function used by
 * the desktop preview canvas and the Pi renderer.
 */
export type DrawRadialSpectrumOptions = {
  width: number;
  height: number;
  /** Color at the inner base of each spoke. */
  lineColor: string;
  /** Color at the outer tip of each spoke (creates a gradient with lineColor). */
  glowColor: string;
  /** Color of the optional inner-radius outline circle. */
  gridColor: string;
  /** Spoke thickness in CSS pixels (clamped down for very high bar counts). */
  lineWidth: number;
  /** Amplification multiplier (1 = neutral). */
  sensitivity: number;
  /** Whether to draw the inner-radius outline. */
  showGrid: boolean;
};

export function drawRadialSpectrum(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawRadialSpectrumOptions,
): void {
  const {
    width,
    height,
    lineColor,
    glowColor,
    gridColor,
    lineWidth,
    sensitivity,
    showGrid,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  if (freqs.length === 0) return;

  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const innerRadius = minDim * 0.18;
  const maxBarLength = minDim * 0.24;
  const barCount = freqs.length;

  /*
   * Keep bars from overlapping each other when the user picks a high bar
   * count. We allow at most ~80% of the available arc width per bar.
   */
  const circumference = 2 * Math.PI * innerRadius;
  const maxBarWidth = (circumference / barCount) * 0.8;
  const barWidth = Math.max(1, Math.min(lineWidth, maxBarWidth));

  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = "butt";

  /*
   * Two passes: a soft outer glow first, then a crisp gradient line on top.
   * The glow uses canvas shadow to bloom out from each bar; the second pass
   * paints the actual gradient with no blur for sharp definition.
   */
  for (let pass = 0; pass < 2; pass++) {
    const isGlow = pass === 0;
    ctx.shadowColor = isGlow ? glowColor : "transparent";
    ctx.shadowBlur = isGlow ? lineWidth * 4 : 0;
    ctx.globalAlpha = isGlow ? 0.35 : 1;
    ctx.lineWidth = isGlow ? barWidth * 1.6 : barWidth;

    for (let i = 0; i < barCount; i++) {
      const magnitude = (freqs[i] / 255) * sensitivity;
      const barLength = Math.min(maxBarLength, magnitude * maxBarLength);
      if (barLength < 1) continue;

      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x1 = cx + innerRadius * cos;
      const y1 = cy + innerRadius * sin;
      const x2 = cx + (innerRadius + barLength) * cos;
      const y2 = cy + (innerRadius + barLength) * sin;

      if (isGlow) {
        ctx.strokeStyle = glowColor;
      } else {
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, lineColor);
        gradient.addColorStop(1, glowColor);
        ctx.strokeStyle = gradient;
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
