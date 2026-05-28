"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import type { ControlsProps } from "../types";
import {
  AUDIO_SOURCE_OPTIONS,
  DEFAULT_GLOW_COLOR,
  DEFAULT_GRID_COLOR,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_SENSITIVITY,
  type AudioModuleConfig,
  type AudioSource,
  type AudioStreamFrame,
} from "./config";
import {
  startAudioCapture,
  type AudioCaptureSession,
  type WaveformFrame,
} from "./audioCapture";
import { drawWaveform } from "./drawWaveform";

export function AudioControls({
  config,
  onChange,
  stream,
}: ControlsProps<AudioModuleConfig>) {
  const sessionRef = useRef<AudioCaptureSession | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<WaveformFrame | null>(null);

  function patch(next: Partial<AudioModuleConfig>) {
    onChange({ ...config, ...next });
  }

  const lineColor = config.lineColor ?? DEFAULT_LINE_COLOR;
  const glowColor = config.glowColor ?? DEFAULT_GLOW_COLOR;
  const gridColor = config.gridColor ?? DEFAULT_GRID_COLOR;
  const lineWidth = config.lineWidth ?? DEFAULT_LINE_WIDTH;
  const sensitivity = config.sensitivity ?? DEFAULT_SENSITIVITY;
  const showGrid = config.showGrid ?? true;
  const rotation = config.rotation ?? 0;

  /**
   * Always stop capture if the Controls unmount - audio capture would
   * otherwise keep the AudioContext alive across module switches.
   */
  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  async function handleStart(source: AudioSource) {
    if (busy) return;
    setBusy(true);
    setStatus("Requesting audio source…");
    try {
      sessionRef.current?.stop();
      sessionRef.current = null;
      const session = await startAudioCapture(source, (frame) => {
        lastFrameRef.current = frame;
        const frameForWire: AudioStreamFrame = {
          samples: frame.samples,
          peak: frame.peak,
          sentAt: Date.now(),
        };
        stream?.emit(frameForWire);
      });
      sessionRef.current = session;
      setCapturing(true);
      setStatus(
        source === "display"
          ? "Capturing system / tab audio."
          : "Capturing microphone.",
      );
      // Remember the source so it'll be the default next time.
      if (config.preferredSource !== source) {
        patch({ preferredSource: source });
      }
    } catch (err) {
      setCapturing(false);
      setStatus(err instanceof Error ? err.message : "Could not start capture.");
    } finally {
      setBusy(false);
    }
  }

  function handleStop() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    lastFrameRef.current = null;
    setCapturing(false);
    setStatus("Capture stopped.");
  }

  /**
   * Live preview animation. Independent of the renderer so the user gets
   * instant feedback that audio is actually being captured even when the
   * Pi is offline.
   */
  useEffect(() => {
    let raf = 0;
    function tick() {
      const canvas = previewCanvasRef.current;
      const frame = lastFrameRef.current;
      if (canvas && frame) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const ratio = window.devicePixelRatio || 1;
          const width = canvas.clientWidth * ratio;
          const height = canvas.clientHeight * ratio;
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          drawWaveform(ctx, frame.samples, {
            width,
            height,
            lineColor,
            glowColor,
            gridColor,
            lineWidth: lineWidth * ratio,
            sensitivity,
            showGrid: false,
          });
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lineColor, glowColor, gridColor, lineWidth, sensitivity]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          Audio Capture
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Choose a source. For <em>System / Tab audio</em>, your browser will
          ask you to share a screen, window, or tab — tick{" "}
          <span className="text-zinc-300">&quot;Share audio&quot;</span> in
          the picker for sound. For <em>Microphone</em>, just grant the mic
          permission.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {AUDIO_SOURCE_OPTIONS.map((option) => {
            const isActive =
              capturing && sessionRef.current?.source === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => void handleStart(option.value)}
                disabled={busy}
                className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 ${
                  isActive
                    ? "bg-cyan-400 text-zinc-950"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {isActive ? `Restart ${option.label}` : `Start ${option.label}`}
              </motion.button>
            );
          })}
          {capturing ? (
            <button
              type="button"
              onClick={handleStop}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Stop
            </button>
          ) : null}
        </div>

        {status ? (
          <p className="mt-3 text-xs text-zinc-400" role="status">
            {status}
          </p>
        ) : null}

        <div
          className="mt-4 h-24 rounded-lg border border-zinc-800 bg-black"
          aria-label="Live waveform preview"
        >
          <canvas
            ref={previewCanvasRef}
            className="h-full w-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Colors</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={lineColor}
              onChange={(event) => patch({ lineColor: event.target.value })}
              aria-label="Line color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Line</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={glowColor}
              onChange={(event) => patch({ glowColor: event.target.value })}
              aria-label="Glow color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Glow</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={gridColor}
              onChange={(event) => patch({ gridColor: event.target.value })}
              aria-label="Grid color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Grid</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-zinc-400">
            <span>Line width</span>
            <span className="font-mono text-zinc-500">{lineWidth}px</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={lineWidth}
            onChange={(event) =>
              patch({ lineWidth: Number(event.target.value) })
            }
            className="accent-cyan-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-zinc-400">
            <span>Sensitivity</span>
            <span className="font-mono text-zinc-500">{sensitivity.toFixed(1)}×</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={sensitivity}
            onChange={(event) =>
              patch({ sensitivity: Number(event.target.value) })
            }
            className="accent-cyan-400"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(event) => patch({ showGrid: event.target.checked })}
        />
        <span>Show grid lines</span>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400">Orientation</span>
        <div className="flex flex-wrap gap-2">
          {ROTATION_OPTIONS.map((option) => (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => patch({ rotation: option.value })}
              className={`rounded-lg px-3 py-2 text-sm ${
                rotation === option.value
                  ? "bg-cyan-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipHorizontal ?? false}
              onChange={(event) =>
                patch({ flipHorizontal: event.target.checked })
              }
            />
            Mirror horizontal
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.flipVertical ?? false}
              onChange={(event) =>
                patch({ flipVertical: event.target.checked })
              }
            />
            Mirror vertical
          </label>
        </div>
      </div>
    </div>
  );
}
