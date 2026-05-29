"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ROTATION_OPTIONS } from "../_lib/orientation";
import type { ControlsProps } from "../types";
import {
  AUDIO_SOURCE_OPTIONS,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_STYLE,
  FREQUENCY_LAYOUT_OPTIONS,
  VISUALIZER_STYLE_OPTIONS,
  resolveStyleSettings,
  type AudioSource,
  type PerStyleSettings,
  type VisualizerModuleConfig,
  type VisualizerStreamFrame,
} from "./config";
import type { WaveformFrame } from "./capture";
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
  getActiveSource,
  getLastFrame,
  isCapturing,
  setFrameSink,
  startSession,
  stopSession,
  subscribeSession,
} from "./sessionStore";

export function VisualizerControls({
  config,
  onChange,
  stream,
}: ControlsProps<VisualizerModuleConfig>) {
  /**
   * Subscribes to the module-level session store. The store survives across
   * Controls mount/unmount cycles, so the capture session (and its
   * MediaStream / AudioContext) persists when the user switches to another
   * module and comes back.
   */
  const capturing = useSyncExternalStore(
    subscribeSession,
    isCapturing,
    () => false,
  );
  const activeSource = useSyncExternalStore(
    subscribeSession,
    getActiveSource,
    () => null,
  );

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<WaveformFrame | null>(getLastFrame());

  const style = config.style ?? DEFAULT_STYLE;

  /** Global config update — for fields shared across all styles. */
  function patch(next: Partial<VisualizerModuleConfig>) {
    onChange({ ...config, ...next });
  }

  /**
   * Per-style config update. Writes into `config.styleSettings[currentStyle]`
   * so changes only affect the active visual. Other styles keep their own
   * customizations (or fall back to factory defaults).
   */
  function patchStyle(next: Partial<PerStyleSettings>) {
    const existing = config.styleSettings?.[style] ?? {};
    onChange({
      ...config,
      styleSettings: {
        ...(config.styleSettings ?? {}),
        [style]: { ...existing, ...next },
      },
    });
  }

  const resolved = resolveStyleSettings(config, style);
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
  } = resolved;
  const performanceMode = config.performanceMode ?? DEFAULT_PERFORMANCE_MODE;
  const rotation = config.rotation ?? 0;
  /** Styles that expose the secondary "Line 2" color and frequency layout. */
  const supportsLine2 =
    style === "stacked-waves" ||
    style === "filled-spectrum" ||
    style === "pixel-bars";
  const supportsFrequencyLayout =
    style === "stacked-waves" ||
    style === "filled-spectrum" ||
    style === "pixel-bars";

  /**
   * Register a frame sink against the store. While Controls is mounted,
   * each incoming waveform frame is forwarded to the renderer via the
   * stream prop and stashed for the local preview canvas. When Controls
   * unmounts (user picks a different module), we clear the sink but leave
   * the capture session running so the share doesn't have to be redone.
   */
  useEffect(() => {
    setFrameSink((frame) => {
      lastFrameRef.current = frame;
      const frameForWire: VisualizerStreamFrame = {
        samples: frame.samples,
        freqs: frame.freqs,
        peak: frame.peak,
        sentAt: Date.now(),
      };
      stream?.emit(frameForWire);
    });
    return () => {
      setFrameSink(null);
    };
  }, [stream]);

  async function handleStart(source: AudioSource) {
    if (busy) return;
    setBusy(true);
    setStatus("Requesting audio source…");
    try {
      await startSession(source);
      setStatus(
        source === "display"
          ? "Capturing system / tab audio."
          : "Capturing microphone.",
      );
      if (config.preferredSource !== source) {
        patch({ preferredSource: source });
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not start capture.");
    } finally {
      setBusy(false);
    }
  }

  function handleStop() {
    stopSession();
    lastFrameRef.current = null;
    setStatus("Capture stopped.");
  }

  /**
   * Preview-local ring history for the concentric-rings style. Reset when
   * the style changes so we don't carry stale rings from a previous mode.
   */
  const previewRingsRef = useRef<Ring[]>([]);
  useEffect(() => {
    previewRingsRef.current = [];
  }, [style]);

  /**
   * Live preview animation. Independent of the renderer so the user gets
   * instant feedback that audio is actually being captured even when the
   * Pi is offline. Style-aware so what you see locally is what shows on
   * the hologram.
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
          if (style === "radial-spectrum") {
            drawRadialSpectrum(ctx, frame.freqs, {
              width,
              height,
              lineColor,
              glowColor,
              gridColor,
              lineWidth: lineWidth * ratio,
              sensitivity,
              showGrid: false,
              performanceMode,
            });
          } else if (style === "concentric-rings") {
            tickAndDrawConcentricRings(ctx, frame.freqs, {
              width,
              height,
              lineColor,
              glowColor,
              gridColor,
              lineWidth: lineWidth * ratio,
              sensitivity,
              showGrid: false,
              rings: previewRingsRef.current,
              maxRings: ringCount,
              expansionPerFrame: ringSpeed * ratio,
              advance: true,
              performanceMode,
            });
          } else if (style === "stacked-waves") {
            drawStackedWaves(ctx, frame.freqs, {
              width,
              height,
              lineColor,
              lineColor2,
              glowColor,
              gridColor,
              lineWidth: lineWidth * ratio,
              sensitivity,
              showGrid: false,
              lineCount: stackCount,
              frequencyLayout,
              performanceMode,
            });
          } else if (style === "filled-spectrum") {
            drawFilledSpectrum(ctx, frame.freqs, {
              width,
              height,
              lineColor,
              lineColor2,
              glowColor,
              gridColor,
              lineWidth: lineWidth * ratio,
              sensitivity,
              showGrid: false,
              frequencyLayout,
              bottomFade,
              performanceMode,
            });
          } else if (style === "pixel-bars") {
            drawPixelBars(ctx, frame.freqs, {
              width,
              height,
              lineColor,
              lineColor2,
              glowColor,
              gridColor,
              lineWidth: lineWidth * ratio,
              sensitivity,
              showGrid: false,
              barCount,
              cellRows,
              frequencyLayout,
              performanceMode,
            });
          } else {
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
    performanceMode,
    ringCount,
    ringSpeed,
    stackCount,
    frequencyLayout,
    bottomFade,
    barCount,
    cellRows,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Audio Capture</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Choose a source. For <em>System / Tab audio</em>, your browser will
          ask you to share a screen, window, or tab — tick{" "}
          <span className="text-zinc-300">&quot;Share audio&quot;</span> in
          the picker for sound. For <em>Microphone</em>, just grant the mic
          permission.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {AUDIO_SOURCE_OPTIONS.map((option) => {
            const isActive = capturing && activeSource === option.value;
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
          className="mt-4 h-32 rounded-lg border border-zinc-800 bg-black"
          aria-label="Live preview"
        >
          <canvas ref={previewCanvasRef} className="h-full w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-zinc-400">Style</span>
        <div className="flex flex-wrap gap-2">
          {VISUALIZER_STYLE_OPTIONS.map((option) => (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => patch({ style: option.value })}
              className={`rounded-lg px-3 py-2 text-sm ${
                style === option.value
                  ? "bg-cyan-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-32 text-zinc-400">Colors</span>
          <span className="text-xs text-zinc-500">
            {style === "radial-spectrum"
              ? "Line = bar base · Glow = bar tip"
              : style === "concentric-rings"
                ? "Line = newest ring · Glow = oldest ring"
                : style === "stacked-waves"
                  ? "Line (top) · Line 2 (bottom) · Glow = edges"
                  : style === "filled-spectrum"
                    ? "Line (top) · Line 2 (bottom) of vertical fill gradient"
                    : style === "pixel-bars"
                      ? "Line (top) · Line 2 (bottom) — gradient interpolated through HSL"
                      : "Line = waveform · Glow = halo"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={lineColor}
              onChange={(event) =>
                patchStyle({ lineColor: event.target.value })
              }
              aria-label="Line color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>{supportsLine2 ? "Line (top)" : "Line"}</span>
          </label>
          {supportsLine2 ? (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="color"
                value={lineColor2}
                onChange={(event) =>
                  patchStyle({ lineColor2: event.target.value })
                }
                aria-label="Line color 2"
                className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
              />
              <span>Line (bottom)</span>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={glowColor}
              onChange={(event) =>
                patchStyle({ glowColor: event.target.value })
              }
              aria-label="Glow color"
              className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            />
            <span>Glow</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="color"
              value={gridColor}
              onChange={(event) =>
                patchStyle({ gridColor: event.target.value })
              }
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
            <span>
              {style === "radial-spectrum"
                ? "Bar thickness"
                : style === "concentric-rings"
                  ? "Ring thickness"
                  : style === "stacked-waves"
                    ? "Wave thickness"
                    : "Line width"}
            </span>
            <span className="font-mono text-zinc-500">{lineWidth}px</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={lineWidth}
            onChange={(event) =>
              patchStyle({ lineWidth: Number(event.target.value) })
            }
            className="accent-cyan-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-zinc-400">
            <span>Sensitivity</span>
            <span className="font-mono text-zinc-500">
              {sensitivity.toFixed(1)}×
            </span>
          </span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={sensitivity}
            onChange={(event) =>
              patchStyle({ sensitivity: Number(event.target.value) })
            }
            className="accent-cyan-400"
          />
        </label>
        {style === "radial-spectrum" ? (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="flex justify-between text-zinc-400">
              <span>Bar count</span>
              <span className="font-mono text-zinc-500">{barCount}</span>
            </span>
            <input
              type="range"
              min={24}
              max={192}
              step={4}
              value={barCount}
              onChange={(event) =>
                patchStyle({ barCount: Number(event.target.value) })
              }
              className="accent-cyan-400"
            />
          </label>
        ) : null}
        {style === "pixel-bars" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-zinc-400">
                <span>Bar count</span>
                <span className="font-mono text-zinc-500">{barCount}</span>
              </span>
              <input
                type="range"
                min={24}
                max={96}
                step={1}
                value={barCount}
                onChange={(event) =>
                  patchStyle({ barCount: Number(event.target.value) })
                }
                className="accent-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-zinc-400">
                <span>Cell rows</span>
                <span className="font-mono text-zinc-500">{cellRows}</span>
              </span>
              <input
                type="range"
                min={4}
                max={48}
                step={1}
                value={cellRows}
                onChange={(event) =>
                  patchStyle({ cellRows: Number(event.target.value) })
                }
                className="accent-cyan-400"
              />
            </label>
          </>
        ) : null}
        {style === "concentric-rings" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-zinc-400">
                <span>Ring count</span>
                <span className="font-mono text-zinc-500">{ringCount}</span>
              </span>
              <input
                type="range"
                min={2}
                max={24}
                step={1}
                value={ringCount}
                onChange={(event) =>
                  patchStyle({ ringCount: Number(event.target.value) })
                }
                className="accent-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-zinc-400">
                <span>Ripple speed</span>
                <span className="font-mono text-zinc-500">{ringSpeed}px/f</span>
              </span>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={ringSpeed}
                onChange={(event) =>
                  patchStyle({ ringSpeed: Number(event.target.value) })
                }
                className="accent-cyan-400"
              />
            </label>
          </>
        ) : null}
        {style === "stacked-waves" ? (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="flex justify-between text-zinc-400">
              <span>Wave count</span>
              <span className="font-mono text-zinc-500">{stackCount}</span>
            </span>
            <input
              type="range"
              min={6}
              max={48}
              step={1}
              value={stackCount}
              onChange={(event) =>
                patchStyle({ stackCount: Number(event.target.value) })
              }
              className="accent-cyan-400"
            />
          </label>
        ) : null}
        {supportsFrequencyLayout ? (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-zinc-400">Frequency layout</span>
            <div className="flex flex-wrap gap-2">
              {FREQUENCY_LAYOUT_OPTIONS.map((option) => (
                <motion.button
                  key={option.value}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() =>
                    patchStyle({ frequencyLayout: option.value })
                  }
                  className={`rounded-lg px-3 py-2 text-sm ${
                    frequencyLayout === option.value
                      ? "bg-cyan-400 text-zinc-950"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  }`}
                >
                  {option.label}
                </motion.button>
              ))}
            </div>
          </label>
        ) : null}
        {style === "filled-spectrum" ? (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="flex justify-between text-zinc-400">
              <span>Bottom fade</span>
              <span className="font-mono text-zinc-500">
                {Math.round(bottomFade * 100)}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={bottomFade}
              onChange={(event) =>
                patchStyle({ bottomFade: Number(event.target.value) })
              }
              className="accent-cyan-400"
            />
            <span className="text-xs text-zinc-500">
              Blends the bottom of the fill into the black background.
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => patchStyle({ showGrid: event.target.checked })}
          />
          <span>
            {style === "radial-spectrum" || style === "concentric-rings"
              ? "Show inner outline"
              : style === "stacked-waves"
                ? "Show center guide line"
                : style === "filled-spectrum"
                  ? "Show outline stroke + baseline"
                  : style === "pixel-bars"
                    ? "Show dim unlit cells"
                    : "Show grid lines"}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={performanceMode}
            onChange={(event) =>
              patch({ performanceMode: event.target.checked })
            }
          />
          <span>
            Performance mode{" "}
            <span className="text-xs text-zinc-500">
              (recommended for Raspberry Pi — disables glow + caps to 30fps)
            </span>
          </span>
        </label>
      </div>

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
