"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { orientationTransform } from "../_lib/orientation";
import { PIXEL_SHIFT_DURATION_S, usePixelShift } from "../_lib/usePixelShift";
import type { RendererProps } from "../types";
import {
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_STYLE,
  FREQUENCY_BIN_COUNT,
  WAVEFORM_SAMPLE_COUNT,
  resolveStyleSettings,
  type VisualizerModuleConfig,
  type VisualizerStreamFrame,
} from "./config";
import { drawWaveform } from "./drawWaveform";
import { drawRadialSpectrum } from "./drawRadialSpectrum";
import { tickAndDrawConcentricRings, type Ring } from "./drawConcentricRings";
import { drawStackedWaves } from "./drawStackedWaves";
import { drawFilledSpectrum } from "./drawFilledSpectrum";
import { drawPixelBars } from "./drawPixelBars";
import {
  drawFractal,
  createFractalState,
  type FractalState,
} from "./drawFractal";
import {
  drawOrbitArcs,
  createOrbitArcsState,
  type OrbitArcsState,
} from "./drawOrbitArcs";
import { drawPlasma, createPlasmaState, type PlasmaState } from "./drawPlasma";

/**
 * Maximum age, in milliseconds, that a received frame is considered "live".
 * If no frame has arrived within this window we fall back to a blank canvas
 * so the screen doesn't show a frozen visualization from minutes ago.
 */
const FRAME_STALE_MS = 1_000;

// #region agent log
const __dbgDraw = {
  draws: 0,
  fresh: 0,
  stale: 0,
  toggles: 0,
  ageSum: 0,
  ageN: 0,
  lastDraw: 0,
  gapSum: 0,
  gapN: 0,
  gapMax: 0,
  gapMin: 1e9,
  ws: 0,
};
function __dbgDrawFlush(now: number, performanceMode: boolean) {
  if (__dbgDraw.ws === 0) __dbgDraw.ws = now;
  const dur = now - __dbgDraw.ws;
  if (dur < 1000) return;
  fetch(
    "http://127.0.0.1:7349/ingest/dfe4b849-19b2-4b66-bdde-7911ccd8e8d4",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "a0adec",
      },
      body: JSON.stringify({
        sessionId: "a0adec",
        runId: "post-fix",
        hypothesisId: "A,D,G",
        location: "Renderer.tsx:tick",
        message: "draw stats/sec",
        data: {
          performanceMode,
          durMs: Math.round(dur),
          drawPerSec: +((__dbgDraw.draws / dur) * 1000).toFixed(1),
          freshDraws: __dbgDraw.fresh,
          staleDraws: __dbgDraw.stale,
          overlayToggles: __dbgDraw.toggles,
          frameAgeAvgMs: __dbgDraw.ageN
            ? +(__dbgDraw.ageSum / __dbgDraw.ageN).toFixed(1)
            : 0,
          drawGapAvg: __dbgDraw.gapN
            ? +(__dbgDraw.gapSum / __dbgDraw.gapN).toFixed(1)
            : 0,
          drawGapMin: __dbgDraw.gapMin === 1e9 ? 0 : +__dbgDraw.gapMin.toFixed(1),
          drawGapMax: +__dbgDraw.gapMax.toFixed(1),
        },
        timestamp: Date.now(),
      }),
    },
  ).catch(() => {});
  __dbgDraw.draws = 0;
  __dbgDraw.fresh = 0;
  __dbgDraw.stale = 0;
  __dbgDraw.toggles = 0;
  __dbgDraw.ageSum = 0;
  __dbgDraw.ageN = 0;
  __dbgDraw.gapSum = 0;
  __dbgDraw.gapN = 0;
  __dbgDraw.gapMax = 0;
  __dbgDraw.gapMin = 1e9;
  __dbgDraw.ws = now;
}
// #endregion

export function VisualizerRenderer({
  config,
  streamSource,
}: RendererProps<VisualizerModuleConfig>) {
  const pixelShift = usePixelShift();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<VisualizerStreamFrame | null>(null);
  const lastFrameAtRef = useRef<number>(0);

  /*
   * Whether a live frame is currently flowing. Unlike the raw frame data
   * (which streams at ~60Hz and must never touch React state), this only
   * flips on the fresh<->stale transition, so the "Waiting for audio" overlay
   * toggles at most a couple of times per session rather than per frame.
   */
  const [hasLiveFrame, setHasLiveFrame] = useState(false);

  /*
   * Allocated once and reused as the fallback when a frame omits a payload
   * (e.g. spectrum styles no longer ship time-domain `samples` over the
   * wire). Keeping them stable avoids a per-frame allocation.
   */
  const flatSamples = useMemo(
    () => new Uint8Array(WAVEFORM_SAMPLE_COUNT).fill(128),
    [],
  );
  const flatFreqs = useMemo(() => new Uint8Array(FREQUENCY_BIN_COUNT), []);

  /*
   * Subscribe to the imperative frame bus. Each incoming frame is normalized
   * once (Socket.IO may hand us Buffer-ish objects) and written straight into
   * `frameRef` — no React state, so frames never re-render the tree. The rAF
   * loop below reads `frameRef` on its own schedule.
   */
  useEffect(() => {
    if (!streamSource) return;
    const ingest = (data: unknown) => {
      const f = data as VisualizerStreamFrame | undefined;
      if (!f || (!f.samples && !f.freqs)) return;
      const samples =
        f.samples instanceof Uint8Array
          ? f.samples
          : f.samples
            ? new Uint8Array(f.samples as ArrayLike<number>)
            : flatSamples;
      const freqs =
        f.freqs instanceof Uint8Array
          ? f.freqs
          : f.freqs
            ? new Uint8Array(f.freqs as ArrayLike<number>)
            : flatFreqs;
      frameRef.current = { samples, freqs, peak: f.peak };
      lastFrameAtRef.current = Date.now();
    };
    // Pick up any frame that arrived before we subscribed.
    const existing = streamSource.getLatest();
    if (existing) ingest(existing);
    return streamSource.subscribe(ingest);
  }, [streamSource, flatSamples, flatFreqs]);

  const style = config.style ?? DEFAULT_STYLE;
  const {
    lineColor,
    lineColor2,
    glowColor,
    gridColor,
    lineWidth,
    sensitivity,
    showGrid,
    barCount,
    ringCount,
    ringSpeed,
    stackCount,
    frequencyLayout,
    bottomFade,
    cellRows,
    triangleSize,
  } = resolveStyleSettings(config, style);
  const performanceMode = config.performanceMode ?? DEFAULT_PERFORMANCE_MODE;
  const { rotate, scaleX, scaleY } = orientationTransform(config);

  /*
   * Single requestAnimationFrame loop. We draw whatever is in frameRef on
   * each tick, so stream latency / framerate fluctuations don't make the
   * visualization stutter. When no frame is available (or it's stale), we
   * render a blank field.
   */
  /*
   * Persistent ring-history buffer for the concentric-rings style. Lives
   * in a ref so it survives re-renders and accumulates across frames.
   * Reset when the style changes so a stale ring trail doesn't bleed into
   * the new visualization.
   */
  const ringsRef = useRef<Ring[]>([]);
  useEffect(() => {
    ringsRef.current = [];
  }, [style]);

  /*
   * Persistent ping-pong buffers + hue state for the fractal-feedback
   * style. Reset when the style changes so a stale buffer doesn't bleed
   * into a different visualization.
   */
  const fractalStateRef = useRef<FractalState>(createFractalState());
  useEffect(() => {
    fractalStateRef.current = createFractalState();
  }, [style]);

  /*
   * Persistent per-arc rotation phases + hue cycle for the orbit-arcs
   * style. Reset on style change so we don't carry stale phases.
   */
  const orbitArcsStateRef = useRef<OrbitArcsState>(createOrbitArcsState());
  useEffect(() => {
    orbitArcsStateRef.current = createOrbitArcsState();
  }, [style]);

  /*
   * Persistent offscreen buffer + palette LUT + t/t2 accumulators for
   * the plasma style. Reset on style change so a stale buffer doesn't
   * leak through (it would just get overwritten on first frame anyway,
   * but resetting keeps memory tidy when switching styles).
   */
  const plasmaStateRef = useRef<PlasmaState>(createPlasmaState());
  useEffect(() => {
    plasmaStateRef.current = createPlasmaState();
  }, [style]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /*
     * On Pi 4 the canvas is software-rasterized; rendering at devicePixelRatio
     * > 1 doubles every pixel the CPU has to touch. Cap it at 1 in
     * performance mode — visually the bars look identical on a 1080p HDMI
     * panel and the per-frame cost roughly quarters.
     */
    const maxRatio = performanceMode ? 1 : window.devicePixelRatio || 1;
    /*
     * In performance mode throttle the draw loop to ~30fps. Audio data
     * still arrives at the original cadence; we just skip frames we don't
     * have CPU budget to render.
     */
    const minFrameInterval = performanceMode ? 33 : 0;
    let lastDrawAt = 0;
    let raf = 0;
    // Mirror of `hasLiveFrame` so we only call setState on the actual
    // fresh<->stale transition rather than every drawn frame.
    let lastFresh: boolean | null = null;

    function tick() {
      if (!canvas || !ctx) return;
      const now = performance.now();
      if (now - lastDrawAt < minFrameInterval) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastDrawAt = now;
      // #region agent log
      __dbgDraw.draws++;
      if (__dbgDraw.lastDraw) {
        const g = now - __dbgDraw.lastDraw;
        __dbgDraw.gapSum += g;
        __dbgDraw.gapN++;
        if (g > __dbgDraw.gapMax) __dbgDraw.gapMax = g;
        if (g < __dbgDraw.gapMin) __dbgDraw.gapMin = g;
      }
      __dbgDraw.lastDraw = now;
      // #endregion

      const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
      const width = canvas.clientWidth * ratio;
      const height = canvas.clientHeight * ratio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const fresh = Boolean(
        frameRef.current &&
          Date.now() - lastFrameAtRef.current < FRAME_STALE_MS,
      );
      if (fresh !== lastFresh) {
        lastFresh = fresh;
        setHasLiveFrame(fresh);
        // #region agent log
        __dbgDraw.toggles++;
        // #endregion
      }
      // #region agent log
      if (fresh) {
        __dbgDraw.fresh++;
        __dbgDraw.ageSum += Date.now() - lastFrameAtRef.current;
        __dbgDraw.ageN++;
      } else {
        __dbgDraw.stale++;
      }
      __dbgDrawFlush(now, performanceMode);
      // #endregion
      const samples =
        fresh && frameRef.current!.samples
          ? frameRef.current!.samples
          : flatSamples;
      const freqs = fresh ? frameRef.current!.freqs : flatFreqs;

      if (style === "radial-spectrum") {
        const bars = resampleBars(freqs, barCount);
        drawRadialSpectrum(ctx, bars, {
          width,
          height,
          lineColor,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          performanceMode,
        });
      } else if (style === "concentric-rings") {
        tickAndDrawConcentricRings(ctx, freqs, {
          width,
          height,
          lineColor,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          rings: ringsRef.current,
          maxRings: ringCount,
          expansionPerFrame: ringSpeed * ratio,
          advance: fresh === true,
          performanceMode,
        });
      } else if (style === "stacked-waves") {
        drawStackedWaves(ctx, freqs, {
          width,
          height,
          lineColor,
          lineColor2,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          lineCount: stackCount,
          frequencyLayout,
          performanceMode,
        });
      } else if (style === "filled-spectrum") {
        drawFilledSpectrum(ctx, freqs, {
          width,
          height,
          lineColor,
          lineColor2,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          frequencyLayout,
          bottomFade,
          performanceMode,
        });
      } else if (style === "pixel-bars") {
        drawPixelBars(ctx, freqs, {
          width,
          height,
          lineColor,
          lineColor2,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          barCount,
          cellRows,
          frequencyLayout,
          performanceMode,
        });
      } else if (style === "fractal") {
        drawFractal(ctx, samples, freqs, {
          width,
          height,
          lineColor,
          lineColor2,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          state: fractalStateRef.current,
          performanceMode,
        });
      } else if (style === "orbit-arcs") {
        drawOrbitArcs(ctx, freqs, {
          width,
          height,
          lineColor,
          lineColor2,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          ringCount,
          ringSpeed,
          state: orbitArcsStateRef.current,
          performanceMode,
        });
      } else if (style === "plasma") {
        drawPlasma(ctx, freqs, {
          width,
          height,
          lineColor,
          lineColor2,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
          ringSpeed,
          triangleSize,
          state: plasmaStateRef.current,
          performanceMode,
        });
      } else {
        drawWaveform(ctx, samples, {
          width,
          height,
          lineColor,
          glowColor,
          gridColor,
          lineWidth: lineWidth * ratio,
          sensitivity,
          showGrid,
        });
      }

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    style,
    lineColor,
    lineColor2,
    glowColor,
    gridColor,
    lineWidth,
    sensitivity,
    showGrid,
    barCount,
    ringCount,
    ringSpeed,
    stackCount,
    frequencyLayout,
    bottomFade,
    cellRows,
    triangleSize,
    performanceMode,
    flatSamples,
    flatFreqs,
  ]);

  const hasRecentFrame = hasLiveFrame;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{ duration: PIXEL_SHIFT_DURATION_S, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={false}
          animate={{ rotate, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="relative flex h-full w-full items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            className={
              style === "radial-spectrum" ||
              style === "concentric-rings" ||
              style === "orbit-arcs"
                ? "h-[90vh] w-[90vh] max-w-[90vw]"
                : "h-[80vh] w-[90vw]"
            }
            aria-label="Audio visualizer"
          />
          {!hasRecentFrame ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[3vmin]"
              style={{ color: gridColor }}
            >
              <p>
                Waiting for audio…
                <br />
                <span className="text-[2vmin] opacity-70">
                  Start capture from the desktop control panel.
                </span>
              </p>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * Downsample / upsample a frequency array to exactly `target` bars by
 * averaging the source bins that fall into each output bucket. Lets the
 * Renderer respect the user's `barCount` config without re-capturing.
 */
function resampleBars(source: Uint8Array, target: number): Uint8Array {
  if (target <= 0) return new Uint8Array(0);
  if (source.length === target) return source;
  const out = new Uint8Array(target);
  const ratio = source.length / target;
  for (let i = 0; i < target; i++) {
    const lo = Math.floor(i * ratio);
    const hi = Math.max(lo + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = lo; j < hi && j < source.length; j++) {
      sum += source[j];
      count++;
    }
    out[i] = count > 0 ? Math.floor(sum / count) : 0;
  }
  return out;
}
