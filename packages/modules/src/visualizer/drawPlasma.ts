/**
 * Demo-scene cosine plasma — the classic "you can do graphics on a
 * 286" effect. Each pixel's color is computed from a sum of cheap
 * periodic functions of (x, y, t); advancing `t` over time animates
 * the whole field into a slow lava-lamp flow.
 *
 * Pixel math (per buffer pixel):
 *   v = sin(x / s1 + t)             // vertical bands
 *     + sin(y / s2 + t)             // horizontal bands
 *     + sin((x + y) / s3 + t)       // diagonal bands
 *     + sin(dist((x,y), c) / s4 + t2) // concentric ripples
 * `v` lands in [-4, 4]; remap to [0, 255] and look up a precomputed
 * palette LUT. That's the entire trick.
 *
 * Performance strategy (Pi 4-friendly):
 *   - Render to a TINY offscreen buffer (≤192×~108 in normal mode,
 *     ≤128×~72 in performance mode). The visible canvas then upscales
 *     this with bilinear smoothing, which is desirable here — the
 *     smoothing softens the plasma into the lava-lamp look.
 *   - Pack pixels into a Uint32 view of the ImageData buffer so each
 *     pixel write is one machine word instead of four byte stores.
 *   - The palette is precomputed (256 entries) into a Uint32Array once
 *     per color change. Per-pixel work is then 4× Math.sin + 1× Math.sqrt
 *     + 1× array lookup + 1× array store.
 *
 * Endianness note: we assume the target is little-endian (all browsers,
 * x86, ARM/Raspberry Pi). The packed-color expression
 *   (0xff << 24) | (b << 16) | (g << 8) | r
 * matches the byte order [R, G, B, A] inside ImageData on little-endian
 * platforms. If we ever land on a big-endian target the colors will
 * channel-swap — easy to detect and patch with a runtime check, but not
 * worth complicating the code today.
 */

export type PlasmaState = {
  /** Small offscreen canvas that holds the actual pixel grid. */
  buffer: HTMLCanvasElement | null;
  bufferWidth: number;
  bufferHeight: number;
  /** Backing store for the buffer; pixel writes go here. */
  imageData: ImageData | null;
  /** Uint32 view of imageData.data — one 32-bit ABGR-on-LE word per pixel. */
  u32: Uint32Array | null;
  /** 256-entry color lookup table; rebuilt only when colors change. */
  paletteLUT: Uint32Array;
  /** Cache key for the current LUT contents (joined hex colors). */
  paletteKey: string;
  /** Time advanced by base flow + bass — drives the linear sin terms. */
  t: number;
  /** Time advanced by base flow + treble — drives the radial sin term. */
  t2: number;
  /** performance.now() of the previous tick. */
  lastTickAt: number;
};

export function createPlasmaState(): PlasmaState {
  return {
    buffer: null,
    bufferWidth: 0,
    bufferHeight: 0,
    imageData: null,
    u32: null,
    paletteLUT: new Uint32Array(256),
    paletteKey: "",
    /*
     * Randomize initial phase so two instances (e.g. preview canvas
     * and renderer canvas) don't lock into the same exact pattern.
     */
    t: Math.random() * 100,
    t2: Math.random() * 100,
    lastTickAt: 0,
  };
}

export type DrawPlasmaOptions = {
  width: number;
  height: number;
  /** Palette start color (low end of plasma value range). */
  lineColor: string;
  /** Palette end color (high end of plasma value range). */
  lineColor2: string;
  /** Palette midpoint accent (~50% of plasma value range). */
  glowColor: string;
  /** Unused. */
  gridColor: string;
  /** Unused. */
  lineWidth: number;
  /** Amplitude multiplier for audio influence on flow speed (1 = neutral). */
  sensitivity: number;
  /** Unused. */
  showGrid: boolean;
  /** Base time-advance rate (reused from the ringSpeed slider, 1..20). */
  ringSpeed: number;
  /**
   * Triangle size as a fraction (0.3..1) of the largest equilateral
   * triangle that fits the canvas. 1 = canvas-filling, smaller values
   * shrink the triangle about the canvas center with black around it.
   */
  triangleSize: number;
  /** Caller-owned, mutated in place. Hold it in a useRef. */
  state: PlasmaState;
  /** Shrinks the offscreen buffer to ~128 max dimension for Pi. */
  performanceMode?: boolean;
};

export function drawPlasma(
  ctx: CanvasRenderingContext2D,
  freqs: Uint8Array,
  opts: DrawPlasmaOptions,
): void {
  const {
    width,
    height,
    lineColor,
    lineColor2,
    glowColor,
    sensitivity,
    ringSpeed,
    triangleSize,
    state,
    performanceMode = false,
  } = opts;

  if (width <= 0 || height <= 0) return;

  ensureBuffer(state, width, height, performanceMode);
  ensurePalette(state, lineColor, glowColor, lineColor2);
  const { buffer, imageData, u32, paletteLUT, bufferWidth: bw, bufferHeight: bh } = state;
  if (!buffer || !imageData || !u32) return;
  const bctx = buffer.getContext("2d");
  if (!bctx) return;

  // --- Audio + time --------------------------------------------------
  const bass = avgBand(freqs, 0, 0.12);
  const treble = avgBand(freqs, 0.45, 1.0);
  const now = performance.now();
  const dt = state.lastTickAt
    ? Math.min(0.1, (now - state.lastTickAt) / 1000)
    : 0;
  state.lastTickAt = now;

  /*
   * Map the user's ringSpeed slider (1..20) to a base flow rate of
   * roughly 0.15..3 rad/sec. Bass adds up to ~6 rad/sec on top; treble
   * adds up to ~8 rad/sec to the radial term. Sensitivity scales the
   * audio contribution so users can dial in how reactive vs. ambient
   * they want the motion to feel.
   */
  const baseFlow = ringSpeed * 0.15;
  state.t += dt * (baseFlow + bass * 6 * sensitivity);
  state.t2 += dt * (baseFlow * 0.7 + treble * 8 * sensitivity);

  // --- Spatial-frequency constants -----------------------------------
  /*
   * "Wave count" per term — how many full sine periods fit across the
   * buffer in each direction. Tuned for a pleasant balance of detail
   * vs. broad blobs. Larger values = busier pattern.
   */
  const WAVES_X = 3.0;
  const WAVES_Y = 3.0;
  const WAVES_DIAG = 2.0;
  const WAVES_RADIAL = 4.0;
  const TAU = Math.PI * 2;
  const s1 = bw / (WAVES_X * TAU);
  const s2 = bh / (WAVES_Y * TAU);
  const s3 = (bw + bh) / (WAVES_DIAG * TAU);
  const diag = Math.sqrt(bw * bw + bh * bh);
  const s4 = diag / (WAVES_RADIAL * TAU);

  // --- Drifting center for the radial term ---------------------------
  /*
   * The center of the concentric ripples wanders inside the buffer on
   * a slow Lissajous so the pattern never feels "pinned" to one spot.
   * Wander amount is ±20% of the buffer dimension from center.
   */
  const cx = bw * (0.5 + Math.sin(state.t * 0.13) * 0.2);
  const cy = bh * (0.5 + Math.cos(state.t * 0.17) * 0.2);

  // --- Hot loop: write one pixel per iteration -----------------------
  const t = state.t;
  const t2 = state.t2;
  const sin = Math.sin;
  const sqrt = Math.sqrt;
  /*
   * v ∈ [-4, 4]. To map to [0, 255] we multiply by 31.875 and offset.
   * Precompute that scale so the inner loop has one fewer instruction.
   */
  const V_TO_IDX = 255 / 8;

  for (let y = 0; y < bh; y++) {
    /*
     * Per-row precomputation: sin(y / s2 + t) doesn't depend on x, and
     * neither does (y - cy)². Pulling them out of the inner loop is
     * the single biggest win on a 192×108 buffer.
     */
    const sinY = sin(y / s2 + t);
    const dy = y - cy;
    const dy2 = dy * dy;
    const ys3 = y / s3; // contribution of y to the diagonal term
    const rowOff = y * bw;

    for (let x = 0; x < bw; x++) {
      const sinX = sin(x / s1 + t);
      const sinDiag = sin(ys3 + x / s3 + t);
      const dx = x - cx;
      const dist = sqrt(dx * dx + dy2);
      const sinDist = sin(dist / s4 + t2);

      const v = sinX + sinY + sinDiag + sinDist;
      // Remap v ∈ [-4, 4] → idx ∈ [0, 255], clamped.
      let idxF = (v + 4) * V_TO_IDX;
      if (idxF < 0) idxF = 0;
      else if (idxF > 255) idxF = 255;

      u32[rowOff + x] = paletteLUT[idxF | 0];
    }
  }

  bctx.putImageData(imageData, 0, 0);

  // --- Upscale to the visible canvas --------------------------------
  /*
   * `imageSmoothingEnabled` is critical here — without it the tiny
   * buffer would render as chunky 12px squares. With it, the browser
   * applies a bilinear filter as part of drawImage, which smooths the
   * pattern into the buttery lava-lamp look we want. On the Pi this
   * is still software-rasterized but it's a single rect blit so it's
   * comfortably real-time at our buffer sizes.
   */
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    (ctx as CanvasRenderingContext2D & {
      imageSmoothingQuality: "low" | "medium" | "high";
    }).imageSmoothingQuality = performanceMode ? "low" : "high";
  }
  ctx.clearRect(0, 0, width, height);

  /*
   * --- Triangle-clipped plasma ------------------------------------------
   * Draw the upscaled plasma buffer through an equilateral-triangle clip
   * so the visualization renders as a hard-edged triangle instead of
   * filling the rectangular canvas. The triangle's bounding box is
   * centered on the canvas; we pick the largest side length that fits
   * either dimension, then build the apex-up vertex set.
   *
   * Geometry — for an equilateral triangle with side `s`:
   *   height = s · √3 / 2
   * The triangle fits the canvas when both s ≤ width AND height ≤ height,
   * which gives:
   *   s ≤ width                  (base fits horizontally)
   *   s ≤ 2·height / √3 ≈ 1.155·h (height fits vertically)
   *
   * Clipping is faster than the alternative (fill the non-triangle area
   * with black) because plasma pixels outside the clip are skipped by
   * the rasterizer entirely — useful on the Pi.
   */
  const triCx = width / 2;
  const triCy = height / 2;
  const SQRT3 = Math.sqrt(3);
  /*
   * `triangleSize` scales the max-fitting equilateral triangle about
   * the canvas center. Clamped to a usable range so a stray bad value
   * can't shrink the triangle to nothing or push it past the canvas.
   */
  const sizeFraction = Math.min(1, Math.max(0.1, triangleSize));
  const maxSide = Math.min(width, (2 * height) / SQRT3);
  const side = maxSide * sizeFraction;
  const triHeight = (side * SQRT3) / 2;
  const apexY = triCy - triHeight / 2;
  const baseY = triCy + triHeight / 2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(triCx, apexY);
  ctx.lineTo(triCx + side / 2, baseY);
  ctx.lineTo(triCx - side / 2, baseY);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(buffer, 0, 0, width, height);
  ctx.restore();
}

// =====================================================================
//  Buffer + palette management
// =====================================================================

function ensureBuffer(
  state: PlasmaState,
  width: number,
  height: number,
  performanceMode: boolean,
): void {
  /*
   * Aspect-match the buffer to the visible canvas so the upscale is
   * uniform in x and y — otherwise circular ripples would render as
   * ellipses on wide displays. Cap the largest dimension to keep the
   * per-frame pixel count manageable on the Pi.
   */
  const aspectRatio = width / Math.max(1, height);
  const targetMax = performanceMode ? 128 : 192;
  let targetW: number;
  let targetH: number;
  if (aspectRatio >= 1) {
    targetW = targetMax;
    targetH = Math.max(8, Math.round(targetMax / aspectRatio));
  } else {
    targetH = targetMax;
    targetW = Math.max(8, Math.round(targetMax * aspectRatio));
  }

  if (
    state.buffer &&
    state.bufferWidth === targetW &&
    state.bufferHeight === targetH
  ) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const bctx = canvas.getContext("2d");
  if (!bctx) return;

  state.buffer = canvas;
  state.bufferWidth = targetW;
  state.bufferHeight = targetH;
  state.imageData = bctx.createImageData(targetW, targetH);
  state.u32 = new Uint32Array(state.imageData.data.buffer);
}

function ensurePalette(
  state: PlasmaState,
  lineColor: string,
  glowColor: string,
  lineColor2: string,
): void {
  const key = `${lineColor}|${glowColor}|${lineColor2}`;
  if (state.paletteKey === key) return;

  const aHsl = hexToHsl(lineColor);
  const mHsl = hexToHsl(glowColor);
  const bHsl = hexToHsl(lineColor2);
  const lut = state.paletteLUT;
  /*
   * Three-stop palette: lineColor at index 0, glowColor at 128,
   * lineColor2 at 255. HSL interpolation along the shorter hue arc
   * keeps the transitions chromatic instead of cycling through gray.
   */
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let hsl: Hsl;
    if (t < 0.5) {
      hsl = lerpHsl(aHsl, mHsl, t * 2);
    } else {
      hsl = lerpHsl(mHsl, bHsl, (t - 0.5) * 2);
    }
    const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l);
    // Pack ABGR on little-endian to match ImageData byte order.
    lut[i] = (((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0);
  }

  state.paletteKey = key;
}

// =====================================================================
//  Helpers
// =====================================================================

function avgBand(freqs: Uint8Array, lo: number, hi: number): number {
  if (freqs.length === 0) return 0;
  const start = Math.max(0, Math.floor(lo * freqs.length));
  const end = Math.min(freqs.length, Math.floor(hi * freqs.length));
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += freqs[i];
  return sum / (end - start) / 255;
}

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return { h: 0, s: 70, l: 50 };
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
  // Shortest-arc hue lerp avoids slow lerps through gray midpoints.
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    h: (a.h + dh * t + 360) % 360,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 1) [r1, g1, b1] = [c, x, 0];
  else if (hh < 2) [r1, g1, b1] = [x, c, 0];
  else if (hh < 3) [r1, g1, b1] = [0, c, x];
  else if (hh < 4) [r1, g1, b1] = [0, x, c];
  else if (hh < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lNorm - c / 2;
  return {
    r: Math.max(0, Math.min(255, Math.round((r1 + m) * 255))),
    g: Math.max(0, Math.min(255, Math.round((g1 + m) * 255))),
    b: Math.max(0, Math.min(255, Math.round((b1 + m) * 255))),
  };
}
