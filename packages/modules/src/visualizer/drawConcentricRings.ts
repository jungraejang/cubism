/**
 * Concentric-rings visualizer. Each animation tick:
 *  1. Snapshot the current frequency response into a new "ring" — a closed
 *     wavy polygon whose per-angle radius is driven by the FFT magnitude
 *     at that angle.
 *  2. Push the new ring at the innermost position.
 *  3. Age every existing ring by expanding its base radius outward.
 *  4. Trim rings that have grown past the canvas, or once we've exceeded
 *     the `maxRings` cap.
 *  5. Draw all rings from oldest (outermost) to newest (innermost) so the
 *     newer ones layer on top, with a per-ring color interpolated between
 *     `lineColor` (newest) and `glowColor` (oldest).
 *
 * The ring history lives outside this function so it can persist across
 * paints — callers pass in a mutable `Ring[]` they keep in a ref.
 *
 * Perf notes:
 *  - Each ring is rendered as a single closed Path2D stroke. With the
 *    default 96 points × 8 rings that's ~770 line segments per frame, well
 *    within Pi 4's per-frame budget.
 *  - We do NOT use shadowBlur here for the same reason the radial spectrum
 *    avoids it on Pi (software rasterization is brutally slow).
 */

export type Ring = {
  /** Per-angle radial offsets (CSS pixels) sampled at ring creation time. */
  shape: Float32Array;
  /** Distance from center to the ring's base. Grows each tick. */
  baseRadius: number;
};

const POINT_COUNT = 128;
const SHAPE_SMOOTHING_WINDOW = 3;

export type DrawConcentricRingsOptions = {
  width: number;
  height: number;
  /** Color of the newest (innermost) ring. */
  lineColor: string;
  /** Color of the oldest (outermost) ring. */
  glowColor: string;
  /** Color of the inner outline + axis guides. */
  gridColor: string;
  /** Stroke width in CSS pixels. */
  lineWidth: number;
  /** Amplitude multiplier (1 = neutral). */
  sensitivity: number;
  /** Whether to draw a faint inner outline circle. */
  showGrid: boolean;
  /** Mutable ring history (mutated in-place by this function). */
  rings: Ring[];
  /** Maximum rings kept alive at once. */
  maxRings: number;
  /** CSS pixels each ring expands outward per draw call. */
  expansionPerFrame: number;
  /** Whether to advance ring state this tick. Set false to render a paused/stale snapshot. */
  advance: boolean;
  /** Skip extra prettiness on Pi-class hardware. */
  performanceMode?: boolean;
};

export function tickAndDrawConcentricRings(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawConcentricRingsOptions,
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
    rings,
    maxRings,
    expansionPerFrame,
    advance,
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const innerRadius = minDim * 0.06;
  const maxRadius = minDim * 0.48;
  /*
   * Per-point amplitude bound. We let bars push outward by up to this much
   * relative to their ring's base radius; sensitivity then scales that.
   */
  const radialScale = minDim * 0.06;

  if (advance) {
    // Age existing rings outward.
    for (const r of rings) {
      r.baseRadius += expansionPerFrame;
    }
    // Trim rings that have grown past the visible area.
    for (let i = rings.length - 1; i >= 0; i--) {
      if (rings[i].baseRadius > maxRadius) {
        rings.splice(i, 1);
      }
    }
    // Add a fresh ring at the inner radius from the current spectrum.
    const shape = new Float32Array(POINT_COUNT);
    if (freqs.length > 0) {
      // Direct sample → smoothing pass so the rings look like flowing
      // curves rather than spiky FFT noise.
      const raw = new Float32Array(POINT_COUNT);
      for (let i = 0; i < POINT_COUNT; i++) {
        // Sample the lower half of the spectrum twice (mirror) so the ring
        // is symmetric and looks pleasing even on mono content.
        const t = i / POINT_COUNT;
        const mirrored = t < 0.5 ? t * 2 : (1 - t) * 2;
        const binIdx = Math.floor(mirrored * (freqs.length - 1));
        raw[i] = (freqs[binIdx] / 255) * radialScale * sensitivity;
      }
      // Circular moving average — N/window-radius scan, cheap.
      for (let i = 0; i < POINT_COUNT; i++) {
        let sum = 0;
        let count = 0;
        for (let k = -SHAPE_SMOOTHING_WINDOW; k <= SHAPE_SMOOTHING_WINDOW; k++) {
          const idx = (i + k + POINT_COUNT) % POINT_COUNT;
          sum += raw[idx];
          count++;
        }
        shape[i] = sum / count;
      }
    }
    rings.unshift({ shape, baseRadius: innerRadius });
    // Cap total ring count.
    while (rings.length > maxRings) {
      rings.pop();
    }
  }

  if (showGrid) {
    /*
     * Audio-reactive "vibrating" inner circle. Bass energy (the lowest
     * ~12% of bins) drives a radius pulse, and a small per-angle wobble
     * driven by the FFT itself gives it a shimmering / vibrating feel
     * instead of a perfectly smooth pulse.
     */
    let bass = 0;
    if (freqs.length > 0) {
      const bassEnd = Math.max(1, Math.floor(freqs.length * 0.12));
      let sum = 0;
      for (let i = 0; i < bassEnd; i++) sum += freqs[i];
      bass = sum / bassEnd / 255; // 0..1
    }
    const pulse = 1 + bass * 0.35;
    const baseR = innerRadius * pulse;
    const wobbleAmp = innerRadius * 0.12 * Math.min(1, bass * 1.5);

    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = Math.max(1, lineWidth * 0.5);
    ctx.globalAlpha = 0.55 + 0.45 * bass;
    ctx.beginPath();
    const STEPS = 96;
    const lobes = 6; // visible wobble cadence around the circle
    for (let i = 0; i <= STEPS; i++) {
      const idx = i % STEPS;
      const angle = (idx / STEPS) * Math.PI * 2;
      // Mix two sources of wobble: a sine lobe (smooth ring "breathing")
      // and a sample from the FFT itself (audio-driven micro-tremor).
      const binIdx = Math.floor((idx / STEPS) * (freqs.length - 1));
      const fftWobble = freqs.length > 0 ? freqs[binIdx] / 255 - 0.5 : 0;
      const offset =
        wobbleAmp * (Math.sin(angle * lobes) * 0.5 + fftWobble * 0.5);
      const r = baseR + offset;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  if (rings.length === 0) return;

  const lineRgb = hexToRgb(lineColor);
  const glowRgb = hexToRgb(glowColor);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;

  /*
   * Draw oldest → newest so the brightest, freshest ring lands on top.
   * `rings[0]` is the newest (we unshift on add), so we iterate in reverse.
   */
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    const ageT = rings.length === 1 ? 0 : i / (rings.length - 1);
    ctx.strokeStyle = lerpRgb(lineRgb, glowRgb, ageT);

    // Older rings can grow past the canvas — clamp display alpha so the
    // outer edges gracefully fade rather than popping out.
    const fadeT = Math.max(
      0,
      Math.min(1, 1 - (ring.baseRadius - innerRadius) / (maxRadius - innerRadius)),
    );
    ctx.globalAlpha = performanceMode ? 1 : 0.6 + 0.4 * fadeT;

    ctx.beginPath();
    for (let j = 0; j <= POINT_COUNT; j++) {
      // Loop one extra index so the path closes seamlessly.
      const idx = j % POINT_COUNT;
      const angle = (idx / POINT_COUNT) * Math.PI * 2;
      const r = ring.baseRadius + ring.shape[idx];
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  // Tolerate "#rgb", "#rrggbb", or already-rgb() strings (best-effort).
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
