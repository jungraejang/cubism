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
  DEFAULT_BAR_COUNT,
  DEFAULT_GLOW_COLOR,
  DEFAULT_GRID_COLOR,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_SENSITIVITY,
  DEFAULT_STYLE,
  FREQUENCY_BIN_COUNT,
  WAVEFORM_SAMPLE_COUNT,
  type VisualizerModuleConfig,
  type VisualizerStreamFrame,
} from "./config";
import { drawWaveform } from "./drawWaveform";
import { drawRadialSpectrum } from "./drawRadialSpectrum";

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
  const lineColor = config.lineColor ?? DEFAULT_LINE_COLOR;
  const glowColor = config.glowColor ?? DEFAULT_GLOW_COLOR;
  const gridColor = config.gridColor ?? DEFAULT_GRID_COLOR;
  const lineWidth = config.lineWidth ?? DEFAULT_LINE_WIDTH;
  const sensitivity = config.sensitivity ?? DEFAULT_SENSITIVITY;
  const showGrid = config.showGrid ?? true;
  const barCount = config.barCount ?? DEFAULT_BAR_COUNT;
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
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const flatSamples = new Uint8Array(WAVEFORM_SAMPLE_COUNT).fill(128);
    const flatFreqs = new Uint8Array(FREQUENCY_BIN_COUNT);
    let raf = 0;

    function tick() {
      if (!canvas || !ctx) return;
      const ratio = window.devicePixelRatio || 1;
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
        /*
         * Sub-bucket the received freqs into `barCount` bars, so the user
         * can dial in fewer/more spokes at runtime without re-capturing.
         */
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
    glowColor,
    gridColor,
    lineWidth,
    sensitivity,
    showGrid,
    barCount,
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
              style === "radial-spectrum"
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
