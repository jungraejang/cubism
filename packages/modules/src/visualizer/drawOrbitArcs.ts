/**
 * Orbit arcs — concentric glowing partial-circle arcs that each rotate
 * at their own speed (some CW, some CCW). Each arc is tied to a slice
 * of the frequency spectrum so it pulses (thickness + brightness) with
 * its band's energy. The innermost arc gets a rainbow conic gradient
 * that spins with the arc, lifting the eye toward the center.
 *
 * Reference vibe: red outer arc + green middle arc + rainbow inner
 * arc, all with thick soft glow on a black background.
 */

export type OrbitArcsState = {
  /**
   * Current rotation phase per arc, in radians. Length grows / shrinks
   * to match `ringCount` between frames. Initialized with a
   * golden-angle stride (≈137.5°) so arcs don't start aligned.
   */
  rotations: number[];
  /** Slowly-rotating hue for the rainbow innermost arc. */
  hue: number;
  /** performance.now() timestamp of the previous tick, for dt math. */
  lastTickAt: number;
};

export function createOrbitArcsState(): OrbitArcsState {
  return { rotations: [], hue: 0, lastTickAt: 0 };
}

export type DrawOrbitArcsOptions = {
  width: number;
  height: number;
  /** Outer-arc color anchor (start of the HSL palette ramp). */
  lineColor: string;
  /** Inner-arc color anchor (end of the HSL palette ramp). */
  lineColor2: string;
  /** Soft halo color used for shadowBlur. */
  glowColor: string;
  /** Currently unused for this style (kept for option-shape symmetry). */
  gridColor: string;
  /** Base stroke width; audio reactivity scales each arc up from this. */
  lineWidth: number;
  /** Amplitude multiplier (1 = neutral). */
  sensitivity: number;
  /** Unused. */
  showGrid: boolean;
  /** Arc count (2..12). Reuses the per-style ringCount setting. */
  ringCount: number;
  /** Base angular speed in degrees-per-second (1..20). */
  ringSpeed: number;
  /** Caller-owned, mutated in place. Hold it in a useRef. */
  state: OrbitArcsState;
  /** Skip shadowBlur + conic-gradient innermost arc on Pi. */
  performanceMode?: boolean;
};

/**
 * Each arc is drawn as a partial circle: full 2π minus a gap. Defines
 * the arc's "open" angle; smaller = closer to a full ring, larger =
 * more like a "C". 80° gap ≈ 280° arc reads instantly as the reference
 * screenshot's shape.
 */
const ARC_GAP_RAD = (80 * Math.PI) / 180;

export function drawOrbitArcs(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawOrbitArcsOptions,
): void {
  const {
    width,
    height,
    lineColor,
    lineColor2,
    glowColor,
    lineWidth,
    sensitivity,
    ringCount,
    ringSpeed,
    state,
    performanceMode = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;

  const count = Math.max(1, Math.min(24, Math.floor(ringCount)));
  ensureRotations(state, count);

  // --- Time delta -----------------------------------------------------
  const now = performance.now();
  const dt = state.lastTickAt
    ? Math.min(0.1, (now - state.lastTickAt) / 1000)
    : 0;
  state.lastTickAt = now;

  // --- Bass for global pulse + slow hue cycle -------------------------
  const bass = avgBand(freqs, 0, 0.12);
  state.hue = (state.hue + dt * (20 + bass * 60)) % 360;

  // --- Geometry -------------------------------------------------------
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  /*
   * Inner / outer radius limits. We leave some margin from the canvas
   * edge so the soft glow has room to breathe; the innermost arc is
   * non-zero so the rainbow conic gradient remains legible (very small
   * radii compress the rainbow into a dot).
   */
  const innerR = minDim * 0.12;
  const outerR = minDim * 0.42;

  // --- Palette --------------------------------------------------------
  const outerHsl = hexToHsl(lineColor);
  const innerHsl = hexToHsl(lineColor2);

  /*
   * Color overlay flag: in non-perf mode the soft glow rings will be
   * drawn under each arc to fake a halo without per-arc shadowBlur on
   * the strokes (cheap). In perf mode we draw a translucent wider
   * underlay stroke instead of using shadowBlur at all.
   */
  const useShadow = !performanceMode;

  // --- Update rotations + draw arcs -----------------------------------
  for (let i = 0; i < count; i++) {
    /*
     * Convention: i=0 is the INNERMOST arc, i=count-1 is the OUTERMOST.
     * Spreading along the palette ramp from inner→outer means
     * `lineColor` ends up on the outer ring (the dominant visual
     * element in the reference shot) and `lineColor2` on the inner.
     */
    const tInner = count > 1 ? i / (count - 1) : 0;
    const radius = innerR + tInner * (outerR - innerR);

    /*
     * Pseudo-random per-arc rotation speed. Alternating sign so
     * neighboring arcs spin opposite ways. Variance via the golden
     * ratio keeps speeds distinct without obvious patterns.
     */
    const sign = i % 2 === 0 ? 1 : -1;
    const variance = 0.6 + ((i * 1.618) % 1) * 0.7;
    const speedRadPerSec = ((ringSpeed * Math.PI) / 180) * sign * variance;
    state.rotations[i] += speedRadPerSec * dt * (1 + bass * 0.6);

    /*
     * Audio reactivity per arc. We map arcs to frequency bands such
     * that the OUTERMOST arc tracks bass (the big drum should pulse
     * the biggest ring) and the innermost arc tracks treble. Band
     * energy modulates stroke thickness and overall brightness.
     */
    const bandLo = 1 - (i + 1) / count;
    const bandHi = 1 - i / count;
    const energy = avgBand(freqs, bandLo, bandHi);
    const thicknessMul = 0.6 + energy * 1.6 * sensitivity;
    const arcLineWidth = lineWidth * thicknessMul;

    const center = state.rotations[i];
    const startAngle = center + ARC_GAP_RAD / 2;
    const endAngle = center + Math.PI * 2 - ARC_GAP_RAD / 2;

    /*
     * Palette: lerp from inner (lineColor2) to outer (lineColor) in
     * HSL so the ramp reads as a natural hue/saturation sweep instead
     * of a muddy RGB midpoint. The innermost arc (i==0) gets a rainbow
     * conic gradient override in non-perf mode.
     */
    const arcHsl = lerpHsl(innerHsl, outerHsl, tInner);
    const isInnermost = i === 0;

    // Halo / underlay (cheap approximation of a glow) ----------------
    if (!useShadow) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = arcLineWidth * 2.4;
      ctx.strokeStyle = `hsla(${arcHsl.h.toFixed(1)},${arcHsl.s.toFixed(1)}%,${arcHsl.l.toFixed(1)}%,0.18)`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.restore();
    }

    // Main arc -------------------------------------------------------
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = arcLineWidth;
    if (useShadow) {
      /*
       * Shadow glow gives the soft outer halo from the screenshot.
       * Scale blur with arc thickness so heavier (louder) arcs glow
       * proportionally more — feels physically correct.
       */
      ctx.shadowBlur = 12 + arcLineWidth * 0.8;
      ctx.shadowColor = glowColor;
    }

    if (isInnermost && !performanceMode && supportsConicGradient(ctx)) {
      /*
       * Rainbow conic gradient that rotates with the arc. We anchor
       * the gradient's startAngle to the arc's current rotation so
       * the rainbow appears glued to the arc rather than the canvas.
       */
      const grad = ctx.createConicGradient(center, cx, cy);
      const stops = 6;
      const baseHue = state.hue;
      for (let s = 0; s <= stops; s++) {
        const h = (baseHue + (s / stops) * 360) % 360;
        grad.addColorStop(s / stops, `hsl(${h.toFixed(1)},85%,55%)`);
      }
      ctx.strokeStyle = grad;
    } else if (isInnermost) {
      /*
       * Perf-mode fallback for the innermost arc: cycle through hues
       * over time as a single solid color. Cheaper than a conic
       * gradient and still reads as "trippy" because the hue moves.
       */
      ctx.strokeStyle = `hsl(${state.hue.toFixed(1)},85%,60%)`;
    } else {
      const brightness = Math.min(1, 0.4 + energy * 0.8);
      const lightness = Math.min(80, arcHsl.l * brightness + 25);
      ctx.strokeStyle = `hsl(${arcHsl.h.toFixed(1)},${arcHsl.s.toFixed(1)}%,${lightness.toFixed(1)}%)`;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  }
}

// --- Helpers -----------------------------------------------------------

function ensureRotations(state: OrbitArcsState, count: number): void {
  while (state.rotations.length < count) {
    /*
     * Golden-angle stride (137.5°) gives a maximally-distributed set
     * of initial phases — no two arcs start near each other no matter
     * how many we end up with.
     */
    const seed = state.rotations.length;
    state.rotations.push(((seed * 137.5) % 360) * (Math.PI / 180));
  }
  if (state.rotations.length > count) state.rotations.length = count;
}

function avgBand(freqs: Uint8Array, lo: number, hi: number): number {
  if (freqs.length === 0) return 0;
  const start = Math.max(0, Math.floor(lo * freqs.length));
  const end = Math.min(freqs.length, Math.floor(hi * freqs.length));
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += freqs[i];
  return sum / (end - start) / 255;
}

function supportsConicGradient(ctx: CanvasRenderingContext2D): boolean {
  return typeof (ctx as unknown as { createConicGradient?: unknown })
    .createConicGradient === "function";
}

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return { h: 0, s: 70, l: 60 };
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
  /*
   * Interpolate hue along the SHORTER arc around the color wheel
   * (avoids slow lerps through gray midpoints when going e.g. from
   * red→green directly).
   */
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = (a.h + dh * t + 360) % 360;
  return {
    h,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}
