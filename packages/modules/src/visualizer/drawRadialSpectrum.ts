/**
 * Shared canvas drawing routine for the radial-spectrum visualizer.
 * Bars are arranged around a circle, length proportional to each
 * (log-spaced) frequency bucket's magnitude.
 *
 * Two fidelity tiers:
 *  - high  (performanceMode=false): per-bar linear gradient + soft outer
 *    glow pass driven by canvas shadowBlur. Looks great on desktop GPUs.
 *  - low   (performanceMode=true):  single pass, solid bar color, no shadow.
 *    Roughly an order of magnitude cheaper on Pi 4's software-rasterized
 *    Chromium where shadowBlur dominates per-frame cost.
 *
 * Same function used by the desktop preview canvas and the Pi renderer.
 */
export type DrawRadialSpectrumOptions = {
  width: number;
  height: number;
  /** Color at the inner base of each spoke (also the solid color in perf mode). */
  lineColor: string;
  /** Color at the outer tip of each spoke. Ignored in perf mode. */
  glowColor: string;
  /** Color of the optional inner-radius outline circle. */
  gridColor: string;
  /** Spoke thickness in CSS pixels (clamped down for very high bar counts). */
  lineWidth: number;
  /** Amplification multiplier (1 = neutral). */
  sensitivity: number;
  /** Whether to draw the inner-radius outline. */
  showGrid: boolean;
  /** Pi-friendly low-fidelity path. */
  performanceMode?: boolean;
};

/*
 * Sin/cos lookup table keyed by barCount. Angles don't change between
 * frames so trig only needs to run once per (barCount, code-reload). On a
 * Pi this saves ~150 Math.cos + Math.sin calls per frame (with barCount=64
 * × 2 endpoints). Negligible alone, but every microsecond counts here.
 */
const angleCache = new Map<number, Float32Array>();
function getAngleTable(barCount: number): Float32Array {
  const existing = angleCache.get(barCount);
  if (existing) return existing;
  const out = new Float32Array(barCount * 2); // [cos0, sin0, cos1, sin1, ...]
  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    out[i * 2] = Math.cos(angle);
    out[i * 2 + 1] = Math.sin(angle);
  }
  angleCache.set(barCount, out);
  return out;
}

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
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  if (freqs.length === 0) return;

  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const innerRadius = minDim * 0.18;
  const maxBarLength = minDim * 0.24;
  const barCount = freqs.length;

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

  const angles = getAngleTable(barCount);

  ctx.save();
  ctx.lineCap = "butt";

  if (performanceMode) {
    /*
     * Fast path: one stroke per bar, solid color, no shadow, no gradient.
     * Coalesces every spoke into a single Path2D so the rasterizer only
     * has to traverse the path tree once instead of per-bar.
     */
    const path = new Path2D();
    for (let i = 0; i < barCount; i++) {
      const magnitude = (freqs[i] / 255) * sensitivity;
      const barLength = Math.min(maxBarLength, magnitude * maxBarLength);
      if (barLength < 1) continue;
      const cos = angles[i * 2];
      const sin = angles[i * 2 + 1];
      const x1 = cx + innerRadius * cos;
      const y1 = cy + innerRadius * sin;
      const x2 = cx + (innerRadius + barLength) * cos;
      const y2 = cy + (innerRadius + barLength) * sin;
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = barWidth;
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.stroke(path);
    ctx.restore();
    return;
  }

  /*
   * High-fidelity path: soft outer glow followed by a per-bar gradient.
   * The glow uses canvas shadow to bloom out from each bar; the second
   * pass paints the actual gradient with no blur for sharp definition.
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
      const cos = angles[i * 2];
      const sin = angles[i * 2 + 1];
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
