/**
 * Winamp/MilkDrop-style fractal-feedback visualizer.
 *
 * The trick: every frame we
 *   1. draw the PREVIOUS frame back into the canvas with a small
 *      rotation + zoom + alpha fade (this is the "feedback");
 *   2. layer a fresh audio-reactive polar waveform on top with a slowly
 *      rotating HSL hue;
 *   3. blit the result to the visible canvas.
 *
 * Because step (1) folds yesterday's pixels into today's pixels under a
 * tiny affine transform, every new audio shape leaves a slowly-swirling
 * trail that self-similarly replicates outward from the center. After a
 * few seconds the screen fills with the trippy fractal smear you see in
 * any classic Winamp viz.
 *
 * Performance — critical on Pi 4:
 *   - We use TWO offscreen canvases as ping-pong buffers. Each frame we
 *     read from A and write to B, then swap. Self-blitting (drawing a
 *     canvas onto itself with a transform) forces software-rasterized
 *     readback on the Pi and tanks framerate; ping-pong avoids that.
 *   - In performance mode we skip the `shadowBlur` glow pass (massive
 *     savings on Pi) and halve the curve resolution. Buffers stay at
 *     the visible canvas size since DPR is already capped to 1 in the
 *     Renderer's perf mode.
 *   - The feedback math is per-frame O(1); the curve draw is O(N) where
 *     N=64..128. Drawing is dominated by the feedback `drawImage` which
 *     is a single rect blit — fine on the Pi.
 */

export type FractalState = {
  /** Holds the PREVIOUS frame. Read-only this tick. */
  bufferA: HTMLCanvasElement | null;
  /** We write THIS tick's output here. Becomes bufferA on swap. */
  bufferB: HTMLCanvasElement | null;
  /** Current buffer dimensions. Used to detect canvas resizes. */
  width: number;
  height: number;
  /** Slowly-rotating hue, in degrees. Audio bass nudges it forward. */
  hue: number;
  /** performance.now() timestamp of the last tick, for dt math. */
  lastTickAt: number;
};

export function createFractalState(): FractalState {
  return {
    bufferA: null,
    bufferB: null,
    width: 0,
    height: 0,
    /*
     * Randomize the starting hue so two side-by-side renderers don't
     * lock-step into the same color phase from the get-go.
     */
    hue: Math.random() * 360,
    lastTickAt: 0,
  };
}

export type DrawFractalOptions = {
  width: number;
  height: number;
  /** Sets the saturation + lightness of the audio curve (its hue rotates). */
  lineColor: string;
  /** Currently unused — reserved for future tint/secondary layer. */
  lineColor2: string;
  /** Color of the soft glow halo around the curve (non-perf mode). */
  glowColor: string;
  /** Unused. */
  gridColor: string;
  /** Stroke width for the audio curve. */
  lineWidth: number;
  /** Amplitude multiplier (1 = neutral). */
  sensitivity: number;
  /** Currently unused for fractal — kept for option-shape symmetry. */
  showGrid: boolean;
  /** Caller-owned, mutated in place. Hold it in a useRef. */
  state: FractalState;
  /** Skip the shadow blur pass + halve curve resolution on Pi. */
  performanceMode?: boolean;
};

export function drawFractal(
  ctx: CanvasRenderingContext2D,
  samples: Uint8Array,
  freqs: Uint8Array,
  opts: DrawFractalOptions,
): void {
  const {
    width,
    height,
    lineColor,
    glowColor,
    lineWidth,
    sensitivity,
    state,
    performanceMode = false,
  } = opts;

  if (width <= 0 || height <= 0) return;

  ensureBuffers(state, width, height);
  const bufA = state.bufferA;
  const bufB = state.bufferB;
  if (!bufA || !bufB) return;
  const ctxB = bufB.getContext("2d");
  if (!ctxB) return;

  // --- Audio metrics ---------------------------------------------------
  // Three coarse bands. The freqs array is already log-bucketed by the
  // capture pipeline so equal slices map to roughly equal octaves.
  const bass = avgBand(freqs, 0, 0.12);
  const mid = avgBand(freqs, 0.12, 0.45);
  // const treble = avgBand(freqs, 0.45, 1.0); // unused right now, but cheap

  // --- Time step -------------------------------------------------------
  const now = performance.now();
  const dt = state.lastTickAt
    ? Math.min(0.1, (now - state.lastTickAt) / 1000)
    : 0;
  state.lastTickAt = now;

  // Hue cycle: 6°/sec idle + up to ~40°/sec on heavy bass. After ~60s
  // of normal music you've made one full revolution around the wheel.
  state.hue = (state.hue + dt * (6 + bass * 40)) % 360;

  // --- Per-frame affine transform parameters ---------------------------
  /*
   * Each frame zooms in slightly and rotates slightly. Because the
   * previous frame is being painted into the new frame UNDER that
   * transform, the visual content drifts outward and rotates — anything
   * drawn at the center stays roughly central while older content
   * spirals out. Bass kicks expand the zoom; midrange energy speeds up
   * the rotation.
   */
  const zoom = 1.008 + bass * 0.025;
  const rotation = 0.003 + mid * 0.018;
  /*
   * Alpha fade for the feedback layer. Lower number = trails decay
   * faster. 0.94 gives ~17 frames worth of visible trail before content
   * fades to imperceptible — about a third of a second at 60fps.
   */
  const fadeAlpha = 0.94;

  const cx = width / 2;
  const cy = height / 2;

  // --- Step 1: feedback — blit bufferA onto bufferB under transform ---
  ctxB.save();
  ctxB.globalCompositeOperation = "source-over";
  ctxB.clearRect(0, 0, width, height);
  ctxB.globalAlpha = fadeAlpha;
  ctxB.translate(cx, cy);
  ctxB.rotate(rotation);
  ctxB.scale(zoom, zoom);
  ctxB.translate(-cx, -cy);
  ctxB.drawImage(bufA, 0, 0);
  ctxB.restore();

  // --- Step 2: draw the fresh audio-reactive curve --------------------
  /*
   * Polar waveform. N evenly-spaced angles around the center, each at a
   * radius = baseRadius + sample[i] * amplitude. Closed loop, single
   * stroke. The feedback step takes care of duplicating + swirling
   * older copies of this same loop.
   */
  const baseHsl = hexToHsl(lineColor);
  const curveColor = `hsl(${state.hue.toFixed(1)},${baseHsl.s.toFixed(1)}%,${baseHsl.l.toFixed(1)}%)`;
  const minDim = Math.min(width, height);
  const baseRadius = minDim * 0.18;
  const amplitude = minDim * 0.13 * sensitivity;
  const pointCount = performanceMode ? 64 : 128;

  ctxB.save();
  ctxB.lineCap = "round";
  ctxB.lineJoin = "round";
  ctxB.lineWidth = lineWidth;
  ctxB.strokeStyle = curveColor;
  if (!performanceMode) {
    ctxB.shadowBlur = 14;
    ctxB.shadowColor = glowColor;
  }
  ctxB.beginPath();
  // samples are Uint8 with 128 = silence. Map to -1..1.
  const sLen = samples.length;
  if (sLen > 0) {
    for (let i = 0; i <= pointCount; i++) {
      const idx = i % pointCount;
      const angle = (idx / pointCount) * Math.PI * 2;
      const sampleIdx = Math.floor((idx / pointCount) * (sLen - 1));
      const v = (samples[sampleIdx] - 128) / 128;
      const r = baseRadius + v * amplitude;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctxB.moveTo(x, y);
      else ctxB.lineTo(x, y);
    }
    ctxB.closePath();
    ctxB.stroke();
  }
  ctxB.restore();

  // --- Step 3: blit the composed buffer to the visible canvas ---------
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bufB, 0, 0);

  // --- Step 4: ping-pong swap -----------------------------------------
  state.bufferA = bufB;
  state.bufferB = bufA;
}

function ensureBuffers(state: FractalState, w: number, h: number): void {
  if (state.bufferA && state.bufferB && state.width === w && state.height === h) {
    return;
  }
  /*
   * Resized — allocate fresh buffers. We don't try to preserve content
   * across resizes because the visible canvas was also just resized,
   * so the visual will re-converge within ~30 frames of feedback.
   */
  const a = document.createElement("canvas");
  a.width = w;
  a.height = h;
  const b = document.createElement("canvas");
  b.width = w;
  b.height = h;
  state.bufferA = a;
  state.bufferB = b;
  state.width = w;
  state.height = h;
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

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return { h: 280, s: 70, l: 60 };
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
