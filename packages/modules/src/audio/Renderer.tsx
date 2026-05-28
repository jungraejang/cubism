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
  DEFAULT_GLOW_COLOR,
  DEFAULT_GRID_COLOR,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_SENSITIVITY,
  WAVEFORM_SAMPLE_COUNT,
  type AudioModuleConfig,
  type AudioStreamFrame,
} from "./config";
import { drawWaveform } from "./drawWaveform";

/**
 * Maximum age, in milliseconds, that a received frame is considered "live".
 * If no frame has arrived within this window we fall back to a flat line so
 * the screen doesn't show a frozen waveform from minutes ago.
 */
const FRAME_STALE_MS = 1_000;

export function AudioRenderer({
  config,
  streamData,
}: RendererProps<AudioModuleConfig>) {
  // `streamData` is typed `unknown` in the generic Renderer contract; narrow
  // here so the rest of the component can use it as an AudioStreamFrame.
  const frame = streamData as AudioStreamFrame | undefined;
  const pixelShift = usePixelShift();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<AudioStreamFrame | null>(null);
  const lastFrameAtRef = useRef<number>(0);

  const lineColor = config.lineColor ?? DEFAULT_LINE_COLOR;
  const glowColor = config.glowColor ?? DEFAULT_GLOW_COLOR;
  const gridColor = config.gridColor ?? DEFAULT_GRID_COLOR;
  const lineWidth = config.lineWidth ?? DEFAULT_LINE_WIDTH;
  const sensitivity = config.sensitivity ?? DEFAULT_SENSITIVITY;
  const showGrid = config.showGrid ?? true;
  const { rotate, scaleX, scaleY } = orientationTransform(config);

  useEffect(() => {
    if (frame && frame.samples) {
      // Socket.IO serializes Uint8Array as a Buffer-ish object. Normalize it
      // back to a Uint8Array so the canvas drawing code can read it.
      const samples =
        frame.samples instanceof Uint8Array
          ? frame.samples
          : new Uint8Array(frame.samples as ArrayLike<number>);
      frameRef.current = { ...frame, samples };
      lastFrameAtRef.current = Date.now();
    }
  }, [frame]);

  /*
   * Single requestAnimationFrame loop. We draw whatever is in frameRef on
   * each tick, so stream latency / framerate fluctuations don't make the
   * line stutter. When no frame is available (or it's stale), we render a
   * faint flat line.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const flat = new Uint8Array(WAVEFORM_SAMPLE_COUNT).fill(128);
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
      const samples = fresh ? frameRef.current!.samples : flat;

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
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lineColor, glowColor, gridColor, lineWidth, sensitivity, showGrid]);

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
            className="h-[80vh] w-[90vw]"
            aria-label="Audio waveform"
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
