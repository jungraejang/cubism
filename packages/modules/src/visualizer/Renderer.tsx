"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { orientationTransform } from "../_lib/orientation";
import {
  PIXEL_SHIFT_DURATION_S,
  usePixelShift,
} from "../_lib/usePixelShift";
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
import {
  tickAndDrawConcentricRings,
  type Ring,
} from "./drawConcentricRings";
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
import {
  drawPlasma,
  createPlasmaState,
  type PlasmaState,
} from "./drawPlasma";

/**
 * Maximum age, in milliseconds, that a received frame is considered "live".
 * If no frame has arrived within this window we fall back to a blank canvas
 * so the screen doesn't show a frozen visualization from minutes ago.
 */
const FRAME_STALE_MS = 1_000;

export function VisualizerRenderer({
  config,
  streamData,
}: RendererProps<VisualizerModuleConfig>) {
  // `streamData` is typed `unknown` in the generic Renderer contract; narrow
  // here so the rest of the component can use it as a VisualizerStreamFrame.
  const frame = streamData as VisualizerStreamFrame | undefined;
  const pixelShift = usePixelShift();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<VisualizerStreamFrame | null>(null);
  const lastFrameAtRef = useRef<number>(0);

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
  } = resolveStyleSettings(config, style);
  const performanceMode = config.performanceMode ?? DEFAULT_PERFORMANCE_MODE;
  const { rotate, scaleX, scaleY } = orientationTransform(config);

  useEffect(() => {
    if (frame && (frame.samples || frame.freqs)) {
      // Socket.IO serializes Uint8Arrays as Buffer-ish objects. Normalize
      // both fields back to Uint8Array so the canvas drawing code can read
      // them. We accept frames that only carry one of the two payloads
      // (older desktops) so the renderer still works during a rolling
      // upgrade.
      const samples =
        frame.samples instanceof Uint8Array
          ? frame.samples
          : frame.samples
            ? new Uint8Array(frame.samples as ArrayLike<number>)
            : new Uint8Array(WAVEFORM_SAMPLE_COUNT).fill(128);
      const freqs =
        frame.freqs instanceof Uint8Array
          ? frame.freqs
          : frame.freqs
            ? new Uint8Array(frame.freqs as ArrayLike<number>)
            : new Uint8Array(FREQUENCY_BIN_COUNT);
      frameRef.current = { ...frame, samples, freqs };
      lastFrameAtRef.current = Date.now();
    }
  }, [frame]);

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

    const flatSamples = new Uint8Array(WAVEFORM_SAMPLE_COUNT).fill(128);
    const flatFreqs = new Uint8Array(FREQUENCY_BIN_COUNT);
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

    function tick() {
      if (!canvas || !ctx) return;
      const now = performance.now();
      if (now - lastDrawAt < minFrameInterval) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastDrawAt = now;

      const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
      const width = canvas.clientWidth * ratio;
      const height = canvas.clientHeight * ratio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const fresh =
        frameRef.current &&
        Date.now() - lastFrameAtRef.current < FRAME_STALE_MS;
      const samples = fresh ? frameRef.current!.samples : flatSamples;
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
    performanceMode,
  ]);

  const hasRecentFrame =
    frameRef.current && Date.now() - lastFrameAtRef.current < FRAME_STALE_MS;

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
