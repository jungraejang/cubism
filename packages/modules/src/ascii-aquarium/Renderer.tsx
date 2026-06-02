"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import type { RendererProps } from "../types";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_BUBBLE_RATE,
  DEFAULT_FISH_COUNT,
  DEFAULT_FISH_SPEED,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_SEAWEED_COLOR,
  DEFAULT_SEAWEED_COUNT,
  type AsciiAquariumConfig,
} from "./config";
import {
  BUBBLE_GLYPHS,
  FISH_PALETTE,
  FISH_SPECIES,
  SEAWEED_SPECIES,
  WIGGLE_PERIOD_MS,
} from "./asciiArt";

/**
 * Pixel-shift parameters — same trick the clock uses to spread burn-in
 * load across nearby sub-pixels. Applied to the outer wrapper so it
 * lives in screen-pixel space regardless of orientation transforms.
 */
const PIXEL_SHIFT_MAX = 3;
const PIXEL_SHIFT_INTERVAL_MS = 60_000;
const PIXEL_SHIFT_DURATION_S = 2;

/**
 * In performance mode our own animation callbacks use this interval. We do
 * not put the Canvas itself in demand mode; runtime logs showed that path can
 * stop producing R3F frames while the page/socket are still alive.
 */
const PERFORMANCE_FRAME_INTERVAL_MS = 66;

/**
 * Aquarium volume bounds in Three.js world units.
 *  - Fish: roam within these in X/Y, fixed Z per instance.
 *  - Seaweed: rooted at y=BOUND_MIN_Y, only sway laterally.
 *  - Bubbles: respawn at y=BOUND_MIN_Y when they reach y=BOUND_MAX_Y.
 *
 * These are CONSERVATIVE compared to the camera's actual visible
 * region because:
 *   1. The perspective camera narrows visible width as objects move
 *      toward it (higher z = smaller visible bounds), so authoring
 *      world bounds for z=0 leaves close-up fish swimming past the
 *      canvas edges.
 *   2. drei's `<Html>` overlay isn't clipped to the canvas DOM — any
 *      element whose 3D projection lands outside the viewport keeps
 *      rendering anyway, until its CSS overflow:hidden ancestor cuts
 *      it off.
 *   3. The aspect ratio of the hologram display varies, but most are
 *      close to 16:9 / 5:3, so a worst-case-narrow assumption keeps
 *      every shape on-screen for everyone.
 *
 * Tighter Z range also keeps the parallax effect subtle enough to
 * read as depth without making far-back fish vanish into pixels.
 */
const BOUND_MIN_X = -2.4;
const BOUND_MAX_X = 2.4;
const BOUND_MIN_Y = -1.5;
const BOUND_MAX_Y = 1.5;
const BOUND_MIN_Z = -0.8;
const BOUND_MAX_Z = 0.6;

/**
 * Fish-only depth roam range. Fish now drift in Z for a parallax depth
 * effect, but we keep the far plane well short of BOUND_MIN_Z so a fish
 * swimming "back" never shrinks to an unreadable speck. The near plane
 * matches the scene max so fish can still glide right up to the glass.
 */
const FISH_Z_MIN = -0.25;
const FISH_Z_MAX = 1;

/** How fast a fish closes the gap to its depth target (world units/sec). */
const FISH_Z_SPEED = 0.5;

/**
 * Explicit depth-scale mapping. drei's `<Html distanceFactor>` does scale
 * with camera distance, but over our shallow z-range at camera distance ~5
 * the variation is only ~15% and barely perceptible. We instead drive a
 * dedicated CSS scale from the fish's normalized z so the depth effect is
 * obvious and directly tunable. MIN is the floor that guarantees a
 * back-swimming fish never becomes an unreadable speck.
 */
const FISH_DEPTH_SCALE_MIN = 0.55;
const FISH_DEPTH_SCALE_MAX = 1.1;

/**
 * Camera-to-element distance factor for drei's `<Html>`. With camera
 * at z=5 and our element z range [-1.8, +1.5], distances run from
 * ~3.5 (closest) to ~6.8 (farthest). At factor=12 that yields scales
 * between ~1.8x (closest fish) and ~3.4x (closest fish in foreground)
 * — comfortable readable text without overlap.
 */
const DISTANCE_FACTOR = 12;

/**
 * Shared monospace stack. ASCII art only aligns properly in a
 * monospace font; we want the browser default (no network fetch) but
 * pick a sane one when the OS provides better options.
 */
const MONO_FONT =
  'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';

/**
 * Body-undulation ("snake swim") parameters. Each fish character is
 * offset vertically by a sine wave that travels along the body from
 * head to tail, so the fish appears to ripple as it swims rather than
 * sliding as a rigid line.
 *
 *  - AMPLITUDE_FACTOR: peak vertical offset as a fraction of the fish's
 *    font size, so larger fish ripple proportionally more.
 *  - ANGULAR_SPEED: radians/sec the wave advances in time (swim cadence).
 *  - PHASE_PER_CHAR: radians of phase added per character along the body.
 *    Higher = more visible "humps" packed into the body at once.
 */
const SWIM_WAVE_AMPLITUDE_FACTOR = 0.15;
const SWIM_WAVE_ANGULAR_SPEED = 7;
const SWIM_WAVE_PHASE_PER_CHAR = 0.85;

/**
 * Fish-to-fish avoidance ("separation" boids rule). Each fish writes
 * its position to a shared registry every frame and steers away from
 * neighbors that are too close, so the school spreads out instead of
 * stacking on top of one another.
 *
 *  - RADIUS: world-unit distance under which two fish start repelling.
 *  - WEIGHT: how strongly avoidance competes with the fish's drive
 *    toward its current waypoint (1 = equal footing with target seek).
 */
const FISH_SEPARATION_RADIUS = 0.85;
const FISH_SEPARATION_WEIGHT = 1.6;

/** Shared, mutable fish positions keyed by fish index (x/y world units). */
type FishPositions = ({ x: number; y: number } | null)[];

/**
 * Seaweed body wave. Layered on top of the existing slow `skewX` swing:
 * each row of the stalk is offset horizontally by a sine wave that
 * travels up the stalk, so the kelp ripples like the fish bodies do.
 * Amplitude tapers to zero at the base so the stalk stays rooted.
 *
 *  - AMPLITUDE_PX: peak horizontal offset (px) at the very tip.
 *  - ANGULAR_SPEED: radians/sec the ripple advances (kept slow/gentle).
 *  - PHASE_PER_ROW: radians of phase added per row up the stalk.
 */
const SEAWEED_WAVE_AMPLITUDE_PX = 3;
const SEAWEED_WAVE_ANGULAR_SPEED = 1.6;
const SEAWEED_WAVE_PHASE_PER_ROW = 0.6;

// #region agent log
function logAquariumDebug(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
) {
  const payload = {
    sessionId: "70f298",
    runId: "freeze-investigation",
    hypothesisId,
    location: "packages/modules/src/ascii-aquarium/Renderer.tsx",
    message,
    data,
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent("cubism:debug-log", { detail: payload }));
  fetch("http://127.0.0.1:7781/ingest/15315dab-8f28-4100-9731-d02658e0d3cd", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "70f298",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function getAquariumDebugMemory() {
  const maybePerformance = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  };
  return maybePerformance.memory
    ? {
        usedJSHeapSize: maybePerformance.memory.usedJSHeapSize,
        totalJSHeapSize: maybePerformance.memory.totalJSHeapSize,
        jsHeapSizeLimit: maybePerformance.memory.jsHeapSizeLimit,
      }
    : null;
}
// #endregion

/**
 * Top-level Renderer. Wrapper pattern matches every other module:
 *
 *   <div h-screen w-screen>                ← carousel slot
 *     <motion.div animate={pixel-shift}>   ← burn-in mitigation
 *       <motion.div animate={orientation}> ← rotate/flip for beam splitter
 *         <Canvas>                         ← R3F WebGL surface
 *           ... scene ...
 *         </Canvas>
 */
export function AsciiAquariumRenderer({
  config,
}: RendererProps<AsciiAquariumConfig>) {
  const rotation = config.rotation ?? 0;
  const scaleX = config.flipHorizontal ? -1 : 1;
  const scaleY = config.flipVertical ? -1 : 1;

  const performanceMode = config.performanceMode ?? DEFAULT_PERFORMANCE_MODE;

  // Honor the user's slider values directly. We used to clamp these
  // against a runtime PERF_CAPS object when performance mode was on,
  // but that gave the sliders a dead zone above the cap — moving from
  // 8 → 12 visibly did nothing because we'd still render only 6 fish.
  // The performance mode toggle now affects render quality and frame
  // throttle, not raw element count; users who push the count past
  // what their Pi can handle can dial it back themselves.
  const fishCount = config.fishCount ?? DEFAULT_FISH_COUNT;
  const fishSpeed = config.fishSpeed ?? DEFAULT_FISH_SPEED;
  const seaweedCount = config.seaweedCount ?? DEFAULT_SEAWEED_COUNT;
  // Bubble pool derived from the user's bubble-per-minute setting.
  // Pool size is fixed; bubbles recycle when they reach the surface
  // (no spawn/despawn churn at run time).
  const bubbleRate = config.bubbleRate ?? DEFAULT_BUBBLE_RATE;
  const bubblePoolSize = Math.max(1, Math.ceil(bubbleRate * 0.18));

  const backgroundColor = config.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const seaweedColor = config.seaweedColor ?? DEFAULT_SEAWEED_COLOR;
  const bubbleColor = config.bubbleColor ?? DEFAULT_BUBBLE_COLOR;

  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const pick = () => {
      const r = () =>
        Math.floor(Math.random() * (PIXEL_SHIFT_MAX * 2 + 1)) - PIXEL_SHIFT_MAX;
      setPixelShift({ x: r(), y: r() });
    };
    pick();
    const id = window.setInterval(pick, PIXEL_SHIFT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // DPR cap is the single biggest Pi win. On a high-DPR display, WebGL
  // would otherwise allocate a 2x or 3x backing store.
  const dpr = performanceMode ? 1 : Math.min(2, window.devicePixelRatio || 1);

  useEffect(() => {
    // #region agent log
    logAquariumDebug("H5", "aquarium renderer config applied", {
      fishCount,
      seaweedCount,
      bubbleRate,
      bubblePoolSize,
      performanceMode,
      fishSpeed,
      dpr,
      htmlOverlayCount: document.querySelectorAll("[data-cubism-aquarium-html]")
        .length,
      memory: getAquariumDebugMemory(),
    });
    // #endregion
  }, [
    bubblePoolSize,
    bubbleRate,
    dpr,
    fishCount,
    fishSpeed,
    performanceMode,
    seaweedCount,
  ]);

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden"
      style={{ background: backgroundColor }}
    >
      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{
          // Pixel-shift drifts ±3px once a minute; keep the easing
          // long enough that the move reads as a passive screen-saver
          // rather than a perceptible jump.
          duration: PIXEL_SHIFT_DURATION_S,
          ease: "easeInOut",
        }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={false}
          animate={{ rotate: rotation, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          /*
           * The ASCII scene is intentionally square. Letting Canvas fill the
           * full carousel slot can make drei's Html overlay measure against a
           * stale/narrow parent during module transitions, which shifts the
           * projected ASCII art sideways. A centered square viewport keeps
           * the Three.js camera, Html overlay, and visible aquarium bounds in
           * the same coordinate space.
           */
          className="relative h-[90vmin] w-[90vmin] max-h-screen max-w-screen overflow-hidden"
          style={{
            background: backgroundColor,
            perspective: "none",
            transformStyle: "flat",
          }}
        >
          {performanceMode ? (
            <DomPerformanceScene
              fishCount={fishCount}
              fishSpeed={fishSpeed}
              seaweedCount={seaweedCount}
              bubblePoolSize={bubblePoolSize}
              seaweedColor={seaweedColor}
              bubbleColor={bubbleColor}
              backgroundColor={backgroundColor}
            />
          ) : (
            <Canvas
              dpr={dpr}
              camera={{ position: [0, 0, 5], fov: 50, near: 0.1, far: 100 }}
              // Antialiasing on text is handled by the browser's font
              // rasterizer (HTML `<pre>`), so the GL antialias setting
              // is mostly cosmetic for any future 3D meshes we add.
              gl={{
                antialias: true,
                alpha: false,
                // The Pi's GPU is the bottleneck and the scene is almost
                // entirely DOM overlays — ask for the low-power path and
                // don't bail out on the Pi's "major performance caveat".
                powerPreference: "low-power",
                failIfMajorPerformanceCaveat: false,
              }}
              style={{
                background: backgroundColor,
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
            >
              <Scene
              fishCount={fishCount}
              fishSpeed={fishSpeed}
              seaweedCount={seaweedCount}
              bubblePoolSize={bubblePoolSize}
              seaweedColor={seaweedColor}
              bubbleColor={bubbleColor}
              performanceMode={performanceMode}
              />
            </Canvas>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

function DomPerformanceScene({
  fishCount,
  fishSpeed,
  seaweedCount,
  bubblePoolSize,
  seaweedColor,
  bubbleColor,
  backgroundColor,
}: {
  fishCount: number;
  fishSpeed: number;
  seaweedCount: number;
  bubblePoolSize: number;
  seaweedColor: string;
  bubbleColor: string;
  backgroundColor: string;
}) {
  const fishParams = useMemo(() => buildFishParams(fishCount), [fishCount]);
  const seaweedParams = useMemo(
    () => buildSeaweedParams(seaweedCount),
    [seaweedCount],
  );
  const bubbleParams = useMemo(
    () => buildBubbleParams(bubblePoolSize),
    [bubblePoolSize],
  );
  const heartbeatCountRef = useRef(0);

  useEffect(() => {
    markAquariumFrame();
    const id = window.setInterval(() => {
      heartbeatCountRef.current += 1;
      markAquariumFrame();
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const lastFrame = (
        window as Window & {
          __cubismAquariumLastFrame?: number;
        }
      ).__cubismAquariumLastFrame;
      // #region agent log
      logAquariumDebug("H2,H3", "dom performance scene health", {
        heartbeatCount: heartbeatCountRef.current,
        lastFrameAgeMs:
          typeof lastFrame === "number" ? Date.now() - lastFrame : null,
        visibilityState: document.visibilityState,
        domFishCount: fishParams.length,
        domSeaweedCount: seaweedParams.length,
        domBubbleCount: bubbleParams.length,
        canvasCount: document.querySelectorAll("canvas").length,
        memory: getAquariumDebugMemory(),
      });
      // #endregion
    }, 60_000);
    return () => window.clearInterval(id);
  }, [bubbleParams.length, fishParams.length, seaweedParams.length]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: backgroundColor }}
    >
      <style>{`
        @keyframes cubism-dom-fish-drift {
          0% { transform: translate3d(0, 0, 0) scale(var(--depth-scale)) scaleX(var(--facing)); }
          50% { transform: translate3d(var(--swim-x), var(--swim-y), 0) scale(var(--depth-scale)) scaleX(var(--facing)); }
          100% { transform: translate3d(0, 0, 0) scale(var(--depth-scale)) scaleX(var(--facing)); }
        }
        @keyframes cubism-dom-seaweed-sway {
          0%, 100% { transform: skewX(-5deg) scaleY(var(--height-scale)); }
          50% { transform: skewX(5deg) scaleY(var(--height-scale)); }
        }
        @keyframes cubism-dom-bubble-rise {
          0% { transform: translate3d(0, 20px, 0); opacity: 0; }
          12% { opacity: 0.85; }
          88% { opacity: 0.75; }
          100% { transform: translate3d(var(--drift-x), -340px, 0); opacity: 0; }
        }
      `}</style>

      {seaweedParams.map((params, i) => {
        const stalk = SEAWEED_SPECIES[params.speciesIndex] ?? SEAWEED_SPECIES[0];
        return (
          <pre
            key={`dom-seaweed-${i}`}
            style={{
              position: "absolute",
              left: `${worldToPercent(params.rootX, BOUND_MIN_X, BOUND_MAX_X)}%`,
              bottom: "10%",
              margin: 0,
              fontFamily: MONO_FONT,
              fontSize: "13px",
              lineHeight: 1,
              color: seaweedColor,
              whiteSpace: "pre",
              textShadow: `0 0 4px ${seaweedColor}55`,
              userSelect: "none",
              transformOrigin: "center bottom",
              animation: `cubism-dom-seaweed-sway ${(4.8 / params.speedMul).toFixed(
                2,
              )}s ease-in-out ${(-params.phase).toFixed(2)}s infinite`,
              ["--height-scale" as string]: params.heightScale.toFixed(3),
            }}
          >
            {stalk}
          </pre>
        );
      })}

      {fishParams.map((params, i) => {
        const species = FISH_SPECIES[params.speciesIndex] ?? FISH_SPECIES[0];
        const duration = Math.max(5, 10 / Math.max(0.25, fishSpeed));
        const facing = params.target.x < params.initial.x ? -1 : 1;
        return (
          <pre
            key={`dom-fish-${i}`}
            style={{
              position: "absolute",
              left: `${worldToPercent(params.initial.x, BOUND_MIN_X, BOUND_MAX_X)}%`,
              top: `${100 - worldToPercent(params.initial.y, BOUND_MIN_Y, BOUND_MAX_Y)}%`,
              margin: 0,
              fontFamily: MONO_FONT,
              fontSize: `${Math.round(11 * species.scale)}px`,
              lineHeight: 1,
              color: params.color,
              whiteSpace: "pre",
              textShadow: `0 0 6px ${params.color}66`,
              userSelect: "none",
              animation: `cubism-dom-fish-drift ${duration.toFixed(
                2,
              )}s ease-in-out ${(-params.phaseMs / 1000).toFixed(2)}s infinite`,
              ["--swim-x" as string]: `${((params.target.x - params.initial.x) * 24).toFixed(
                1,
              )}px`,
              ["--swim-y" as string]: `${((params.target.y - params.initial.y) * -24).toFixed(
                1,
              )}px`,
              ["--depth-scale" as string]: depthScaleForZ(params.initial.z).toFixed(
                3,
              ),
              ["--facing" as string]: String(facing),
            }}
          >
            {species.a}
          </pre>
        );
      })}

      {bubbleParams.map((params, i) => {
        const glyph = BUBBLE_GLYPHS[params.glyphIndex] ?? BUBBLE_GLYPHS[0];
        return (
          <pre
            key={`dom-bubble-${i}`}
            style={{
              position: "absolute",
              left: `${worldToPercent(params.initial.x, BOUND_MIN_X, BOUND_MAX_X)}%`,
              top: `${100 - worldToPercent(params.initial.y, BOUND_MIN_Y, BOUND_MAX_Y)}%`,
              margin: 0,
              fontFamily: MONO_FONT,
              fontSize: `${10 + params.glyphIndex * 3}px`,
              lineHeight: 1,
              color: bubbleColor,
              whiteSpace: "pre",
              textShadow: `0 0 4px ${bubbleColor}88`,
              userSelect: "none",
              animation: `cubism-dom-bubble-rise ${(7 / params.riseSpeed).toFixed(
                2,
              )}s linear ${(-params.driftPhase).toFixed(2)}s infinite`,
              ["--drift-x" as string]: `${Math.sin(params.driftPhase) * 48}px`,
            }}
          >
            {glyph}
          </pre>
        );
      })}
    </div>
  );
}

/**
 * Scene composition lives inside its own component so the three.js
 * context (provided by `<Canvas>`) is available to the `useFrame`
 * hooks below. R3F components MUST be children of `<Canvas>`.
 */
function Scene({
  fishCount,
  fishSpeed,
  seaweedCount,
  bubblePoolSize,
  seaweedColor,
  bubbleColor,
  performanceMode,
}: {
  fishCount: number;
  fishSpeed: number;
  seaweedCount: number;
  bubblePoolSize: number;
  seaweedColor: string;
  bubbleColor: string;
  performanceMode: boolean;
}) {
  const fishParams = useMemo(() => buildFishParams(fishCount), [fishCount]);
  const seaweedParams = useMemo(
    () => buildSeaweedParams(seaweedCount),
    [seaweedCount],
  );
  const bubbleParams = useMemo(
    () => buildBubbleParams(bubblePoolSize),
    [bubblePoolSize],
  );

  // Shared registry of live fish positions so each fish can steer away
  // from its neighbors. Re-sized to match the current fish count (during
  // render so it's ready before the first frame after a count change).
  const fishPositionsRef = useRef<FishPositions>([]);
  if (fishPositionsRef.current.length !== fishParams.length) {
    fishPositionsRef.current = new Array(fishParams.length).fill(null);
  }

  return (
    <>
      <AquariumFrameDriver performanceMode={performanceMode} />
      <WebGLContextGuard />
      <ambientLight intensity={1} />

      {seaweedParams.map((params, i) => (
        <Seaweed
          key={`seaweed-${i}`}
          params={params}
          color={seaweedColor}
          performanceMode={performanceMode}
        />
      ))}

      {fishParams.map((params, i) => (
        <Fish
          key={`fish-${i}`}
          params={params}
          index={i}
          positions={fishPositionsRef.current}
          speedMultiplier={fishSpeed}
          performanceMode={performanceMode}
        />
      ))}

      {bubbleParams.map((params, i) => (
        <Bubble
          key={`bubble-${i}`}
          params={params}
          color={bubbleColor}
          performanceMode={performanceMode}
        />
      ))}
    </>
  );
}

function AquariumFrameDriver({
  performanceMode,
}: {
  performanceMode: boolean;
}) {
  const frameCountRef = useRef(0);
  const lastReportFrameRef = useRef(0);

  useFrame(() => {
    frameCountRef.current += 1;
    markAquariumFrame();
  });

  useEffect(() => {
    markAquariumFrame();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const frameCount = frameCountRef.current;
      const framesSinceLastReport = frameCount - lastReportFrameRef.current;
      lastReportFrameRef.current = frameCount;
      const lastFrame = (window as Window & {
        __cubismAquariumLastFrame?: number;
      }).__cubismAquariumLastFrame;
      // #region agent log
      logAquariumDebug("H2,H3", "aquarium frame driver health", {
        performanceMode,
        frameCount,
        framesSinceLastReport,
        lastFrameAgeMs:
          typeof lastFrame === "number" ? Date.now() - lastFrame : null,
        visibilityState: document.visibilityState,
        htmlOverlayCount: document.querySelectorAll("[data-cubism-aquarium-html]")
          .length,
        canvasCount: document.querySelectorAll("canvas").length,
        memory: getAquariumDebugMemory(),
      });
      // #endregion
    }, 60_000);
    return () => window.clearInterval(id);
  }, [performanceMode]);

  return null;
}

/**
 * Keeps the aquarium alive across WebGL context loss — the #1 cause of a
 * "ran fine, then froze" on Raspberry Pi. The Pi's V3D driver drops the GL
 * context under long-run GPU/memory pressure; by default the browser then
 * refuses to ever restore it and R3F's render loop (plus every drei <Html>
 * overlay) silently stops, looking like a hard freeze.
 *
 * Calling preventDefault() on `webglcontextlost` tells the browser we want
 * the context back, and on `webglcontextrestored` we kick the render loop
 * so the scene resumes without a page reload.
 */
function WebGLContextGuard() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const setFrameloop = useThree((s) => s.setFrameloop);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleLost = (event: Event) => {
      // Without this the context is gone for good and the scene freezes.
      event.preventDefault();
      // #region agent log
      logAquariumDebug("H1", "webgl context lost", {
        memory: getAquariumDebugMemory(),
        visibilityState: document.visibilityState,
      });
      // #endregion
      if (typeof console !== "undefined") {
        console.warn("[ascii-aquarium] WebGL context lost; awaiting restore…");
      }
    };

    const handleRestored = () => {
      // #region agent log
      logAquariumDebug("H1", "webgl context restored", {
        memory: getAquariumDebugMemory(),
        visibilityState: document.visibilityState,
      });
      // #endregion
      if (typeof console !== "undefined") {
        console.warn("[ascii-aquarium] WebGL context restored");
      }
      // Resume the loop (it may have been parked) and force a redraw.
      setFrameloop("always");
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", handleLost as EventListener);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    return () => {
      canvas.removeEventListener(
        "webglcontextlost",
        handleLost as EventListener,
      );
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, [gl, invalidate, setFrameloop]);

  return null;
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------

type FishParams = {
  speciesIndex: number;
  /** Color from FISH_PALETTE — picked per instance for visual variety. */
  color: string;
  initial: { x: number; y: number; z: number };
  /** Per-fish phase offset so wiggle timing isn't synchronized. */
  phaseMs: number;
  /** Initial waypoint to swim toward. Re-rolled when reached. */
  target: { x: number; y: number };
  /** Initial depth waypoint. Re-rolled alongside the x/y target. */
  targetZ: number;
  speed: number;
};

function buildFishParams(count: number): FishParams[] {
  const out: FishParams[] = [];
  for (let i = 0; i < count; i++) {
    const speciesIndex = i % FISH_SPECIES.length;
    out.push({
      speciesIndex,
      color: FISH_PALETTE[i % FISH_PALETTE.length] ?? FISH_PALETTE[0],
      initial: {
        x: lerp(BOUND_MIN_X, BOUND_MAX_X, Math.random()),
        y: lerp(BOUND_MIN_Y + 0.5, BOUND_MAX_Y - 0.3, Math.random()),
        z: lerp(FISH_Z_MIN, FISH_Z_MAX, Math.random()),
      },
      phaseMs: Math.random() * WIGGLE_PERIOD_MS,
      target: pickFishTarget(),
      targetZ: pickFishZ(),
      speed: 0.35 + Math.random() * 0.4,
    });
  }
  return out;
}

/** Picks a depth waypoint within the readable fish z-roam range. */
function pickFishZ(): number {
  return lerp(FISH_Z_MIN, FISH_Z_MAX, Math.random());
}

/**
 * Maps a fish's z (depth) to an explicit CSS scale. Far plane → MIN,
 * near plane → MAX. Clamped so values outside the roam range (e.g. after
 * a constant tweak) still produce a sane, readable scale.
 */
function depthScaleForZ(z: number): number {
  const span = FISH_Z_MAX - FISH_Z_MIN || 1;
  let t = (z - FISH_Z_MIN) / span;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return lerp(FISH_DEPTH_SCALE_MIN, FISH_DEPTH_SCALE_MAX, t);
}

/**
 * Picks a random waypoint within the fish play area. Y stays above
 * the seafloor and below the surface so fish don't graze through
 * scenery elements.
 */
function pickFishTarget(): { x: number; y: number } {
  return {
    x: lerp(BOUND_MIN_X + 0.4, BOUND_MAX_X - 0.4, Math.random()),
    y: lerp(BOUND_MIN_Y + 0.7, BOUND_MAX_Y - 0.5, Math.random()),
  };
}

function Fish({
  params,
  index,
  positions,
  speedMultiplier,
  performanceMode,
}: {
  params: FishParams;
  index: number;
  positions: FishPositions;
  speedMultiplier: number;
  performanceMode: boolean;
}) {
  const groupRef = useRef<Group>(null);
  const preRef = useRef<HTMLPreElement>(null);
  // One span per body character. We mutate each span's CSS transform
  // (vertical offset) and textContent directly every frame — far
  // cheaper than re-rendering React for a per-character animation.
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // The wrapper <div> we apply scaleX(-1) to when swimming left, so
  // the fish glyphs visually face the direction of travel.
  const facingRef = useRef<HTMLDivElement>(null);
  // Outer wrapper we apply a uniform depth scale to (driven by z). Kept
  // separate from facingRef so the per-frame depth scale doesn't fight
  // the CSS transition used for the direction flip.
  const depthRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    x: params.initial.x,
    y: params.initial.y,
    z: params.initial.z,
    target: params.target,
    targetZ: params.targetZ,
    /** +1 = right, -1 = left. Drives the CSS X-scale flip on facingRef. */
    facing: 1 as 1 | -1,
    accum: 0,
    wiggleAccumMs: 0,
    showFrameB: false,
    timeSinceTargetSwitch: 0,
  });

  const species = FISH_SPECIES[params.speciesIndex] ?? FISH_SPECIES[0];

  const baseFontSize = Math.round(11 * species.scale);

  // Per-frame character arrays. Both wiggle frames are authored at the
  // same length, so we can keep a fixed set of spans and only swap each
  // span's character on the tail-flick tick.
  const frameAChars = useMemo(() => species.a.split(""), [species.a]);
  const frameBChars = useMemo(() => species.b.split(""), [species.b]);

  const waveAmplitudePx = baseFontSize * SWIM_WAVE_AMPLITUDE_FACTOR;

  const frameInterval = performanceMode ? PERFORMANCE_FRAME_INTERVAL_MS / 1000 : 0;

  useFrame((state, deltaSec) => {
    const s = stateRef.current;
    s.accum += deltaSec;
    if (s.accum < frameInterval) return;
    const dt = s.accum;
    s.accum = 0;

    // Publish our position so neighbors can avoid us this frame. Mutate
    // the existing slot instead of allocating a fresh object every frame —
    // on the Pi that per-frame garbage is needless GC pressure.
    {
      const slot = positions[index];
      if (slot) {
        slot.x = s.x;
        slot.y = s.y;
      } else {
        positions[index] = { x: s.x, y: s.y };
      }
    }

    // Steer toward the current waypoint.
    const dx = s.target.x - s.x;
    const dy = s.target.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.25) {
      s.target = pickFishTarget();
      s.targetZ = pickFishZ();
      s.timeSinceTargetSwitch = 0;
    }
    s.timeSinceTargetSwitch += dt;
    if (s.timeSinceTargetSwitch > 6) {
      // Periodic kick to a fresh target even if not reached — keeps
      // fish from getting stuck on slow trajectories.
      s.target = pickFishTarget();
      s.targetZ = pickFishZ();
      s.timeSinceTargetSwitch = 0;
    }

    // Separation: accumulate a push away from any neighbor inside the
    // avoidance radius, weighted stronger the closer they are.
    let sepX = 0;
    let sepY = 0;
    for (let j = 0; j < positions.length; j++) {
      if (j === index) continue;
      const other = positions[j];
      if (!other) continue;
      const ox = s.x - other.x;
      const oy = s.y - other.y;
      const d2 = ox * ox + oy * oy;
      if (d2 > 1e-6 && d2 < FISH_SEPARATION_RADIUS * FISH_SEPARATION_RADIUS) {
        const d = Math.sqrt(d2);
        const falloff = (FISH_SEPARATION_RADIUS - d) / FISH_SEPARATION_RADIUS;
        sepX += (ox / d) * falloff;
        sepY += (oy / d) * falloff;
      }
    }

    // Blend the normalized seek direction with the separation push, then
    // move along the combined heading. Separation can fully override the
    // seek when neighbors are very close, which is what prevents stacking.
    const seekLen = dist > 1e-6 ? dist : 1;
    let dirX = dx / seekLen + sepX * FISH_SEPARATION_WEIGHT;
    let dirY = dy / seekLen + sepY * FISH_SEPARATION_WEIGHT;
    const dirLen = Math.hypot(dirX, dirY);
    if (dirLen > 1e-6) {
      dirX /= dirLen;
      dirY /= dirLen;
      const step = params.speed * speedMultiplier * dt;
      s.x += dirX * step;
      s.y += dirY * step;
    }

    // Depth drift: ease toward the current depth waypoint for a parallax
    // effect. Clamped to the readable fish z-range so back-swimming fish
    // never shrink to an unreadable speck.
    const dz = s.targetZ - s.z;
    const zStep = FISH_Z_SPEED * speedMultiplier * dt;
    if (Math.abs(dz) <= zStep) s.z = s.targetZ;
    else s.z += Math.sign(dz) * zStep;
    if (s.z < FISH_Z_MIN) s.z = FISH_Z_MIN;
    else if (s.z > FISH_Z_MAX) s.z = FISH_Z_MAX;

    // Drive the explicit depth scale from the (post-clamp) z so near fish
    // read clearly larger than far fish — the drei distanceFactor alone is
    // too subtle over this z-range to notice.
    if (depthRef.current) {
      depthRef.current.style.transform = `scale(${depthScaleForZ(s.z).toFixed(3)})`;
    }

    // Hard clamp to the bounding box. Fish picking a near-edge target
    // and overshooting it slightly (or starting outside the box after
    // a bounds change) would otherwise drift visibly off-canvas
    // because the Html overlay doesn't clip to the viewport.
    if (s.x < BOUND_MIN_X) s.x = BOUND_MIN_X;
    else if (s.x > BOUND_MAX_X) s.x = BOUND_MAX_X;
    if (s.y < BOUND_MIN_Y) s.y = BOUND_MIN_Y;
    else if (s.y > BOUND_MAX_Y) s.y = BOUND_MAX_Y;

    // Keep the registry in sync with the post-move position (reuse slot).
    {
      const slot = positions[index];
      if (slot) {
        slot.x = s.x;
        slot.y = s.y;
      } else {
        positions[index] = { x: s.x, y: s.y };
      }
    }

    // Update facing based on actual horizontal travel direction. A small
    // deadzone avoids flicker when the fish is moving near-vertically.
    // We apply it as a CSS transform on the inner div (not the Three.js
    // group) because mirroring the Three group would also mirror its
    // child Html overlay's position calculations.
    const newFacing: 1 | -1 = dirX < -0.15 ? -1 : dirX > 0.15 ? 1 : s.facing;
    if (newFacing !== s.facing) {
      s.facing = newFacing;
      if (facingRef.current) {
        facingRef.current.style.transform = `scaleX(${newFacing})`;
      }
    }

    // Tail-flick frame swap. Per-fish phase keeps the school out of sync.
    s.wiggleAccumMs += dt * 1000;
    if (s.wiggleAccumMs >= WIGGLE_PERIOD_MS) {
      s.wiggleAccumMs -= WIGGLE_PERIOD_MS;
      s.showFrameB = !s.showFrameB;
      const frame = s.showFrameB ? frameBChars : frameAChars;
      if (performanceMode) {
        if (preRef.current) preRef.current.textContent = frame.join("");
      } else {
        for (let i = 0; i < charRefs.current.length; i++) {
          const span = charRefs.current[i];
          if (span) span.textContent = frame[i] ?? "";
        }
      }
    }

    if (!performanceMode) {
      // Body undulation: a sine wave travels along the body so the fish
      // ripples like a swimming snake. The phase offset per character
      // (`i * PHASE_PER_CHAR`) is what makes the hump travel head-to-tail
      // instead of every character bobbing in unison. In performance mode
      // this is skipped so each fish stays a single cheap text node.
      const waveTime = state.clock.elapsedTime * SWIM_WAVE_ANGULAR_SPEED;
      for (let i = 0; i < charRefs.current.length; i++) {
        const span = charRefs.current[i];
        if (!span) continue;
        const offset =
          waveAmplitudePx *
          Math.sin(waveTime + params.phaseMs - i * SWIM_WAVE_PHASE_PER_CHAR);
        span.style.transform = `translateY(${offset.toFixed(2)}px)`;
      }
    }

    const g = groupRef.current;
    if (g) {
      // Micro-bob on Y gives a buoyant feel even when moving mostly
      // horizontally. Phase derived from per-fish offset.
      const bob =
        Math.sin((s.wiggleAccumMs / 1000) * 4 + params.phaseMs) * 0.04;
      g.position.x = s.x;
      g.position.y = s.y + bob;
      g.position.z = s.z;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[params.initial.x, params.initial.y, params.initial.z]}
    >
      <Html
        center
        // distanceFactor → drei auto-scales the HTML based on the
        // camera distance, giving us the depth-driven size variation
        // that makes near fish read larger than far fish.
        distanceFactor={DISTANCE_FACTOR}
        // The pointer-event blocker keeps stray clicks from being
        // captured by overlay divs while the user interacts with
        // controls elsewhere.
        style={{ pointerEvents: "none" }}
        data-cubism-aquarium-html="fish"
      >
        <div
          ref={depthRef}
          style={{
            // Depth scale (driven per-frame from z). Initial value matches
            // the fish's starting depth so the first paint is correct.
            transform: `scale(${depthScaleForZ(params.initial.z)})`,
            transformOrigin: "center center",
          }}
        >
          <div
            ref={facingRef}
            style={{
              // Initial facing applied here so the first paint matches
              // the direction we'll start swimming in.
              transform: `scaleX(${params.target.x < params.initial.x ? -1 : 1})`,
              transition: "transform 200ms ease",
              transformOrigin: "center center",
            }}
          >
            <pre
              ref={preRef}
              style={{
                margin: 0,
                fontFamily: MONO_FONT,
                fontSize: `${baseFontSize}px`,
                lineHeight: 1,
                color: params.color,
                whiteSpace: "pre",
                textShadow: `0 0 6px ${params.color}66`,
                userSelect: "none",
              }}
            >
              {performanceMode
                ? species.a
                : frameAChars.map((ch, i) => (
                    <span
                      key={i}
                      ref={(el) => {
                        charRefs.current[i] = el;
                      }}
                      // inline-block lets each glyph take an independent
                      // translateY while monospace keeps columns aligned.
                      style={{ display: "inline-block", whiteSpace: "pre" }}
                    >
                      {ch}
                    </span>
                  ))}
            </pre>
          </div>
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Seaweed
// ---------------------------------------------------------------------------

type SeaweedParams = {
  speciesIndex: number;
  rootX: number;
  z: number;
  phase: number;
  speedMul: number;
  heightScale: number;
};

function buildSeaweedParams(count: number): SeaweedParams[] {
  const out: SeaweedParams[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const evenX = lerp(BOUND_MIN_X + 0.5, BOUND_MAX_X - 0.5, t);
    const jitter = (Math.random() - 0.5) * 0.4;
    out.push({
      speciesIndex: i % SEAWEED_SPECIES.length,
      rootX: evenX + jitter,
      z: lerp(BOUND_MIN_Z, BOUND_MAX_Z * 0.4, Math.random()),
      phase: Math.random() * Math.PI * 2,
      speedMul: 0.9 + Math.random() * 0.3,
      heightScale: lerp(0.7, 1.35, Math.random()),
    });
  }
  return out;
}

function Seaweed({
  params,
  color,
  performanceMode,
}: {
  params: SeaweedParams;
  color: string;
  performanceMode: boolean;
}) {
  const stalk = SEAWEED_SPECIES[params.speciesIndex] ?? SEAWEED_SPECIES[0];
  const preRef = useRef<HTMLPreElement>(null);
  // One ref per stalk row so we can offset each row horizontally for
  // the traveling-wave ripple. Direct DOM mutation avoids re-rendering.
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Top-to-bottom rows of the stalk. Index 0 is the tip; the last row
  // is the rooted base.
  const rows = useMemo(() => stalk.split("\n"), [stalk]);

  // Slower throttle for seaweed — the human eye can't tell the
  // difference between 20 and 60 fps on this kind of gentle sway.
  const frameInterval = performanceMode ? PERFORMANCE_FRAME_INTERVAL_MS / 1000 : 1 / 30;
  const accumRef = useRef(0);

  useFrame((state, deltaSec) => {
    accumRef.current += deltaSec;
    if (accumRef.current < frameInterval) return;
    accumRef.current = 0;

    const pre = preRef.current;
    if (!pre) return;

    // SkewX gives a flag-like bend that reads as kelp swaying in a
    // current. We anchor at the bottom (transform-origin set in JSX)
    // so the base stays planted on the seafloor while the tip drifts.
    const t = state.clock.elapsedTime * params.speedMul + params.phase;
    const skewDeg = Math.sin(t) * 6;
    pre.style.transform = `skewX(${skewDeg}deg) scaleY(${params.heightScale.toFixed(
      3,
    )})`;

    if (performanceMode) return;

    // Per-row ripple traveling up the stalk. Amplitude scales from 0 at
    // the base to full at the tip so the root stays planted.
    const waveTime =
      state.clock.elapsedTime * SEAWEED_WAVE_ANGULAR_SPEED * params.speedMul +
      params.phase;
    const lastRow = rows.length - 1;
    for (let i = 0; i < rowRefs.current.length; i++) {
      const row = rowRefs.current[i];
      if (!row) continue;
      const fromBase = lastRow > 0 ? (lastRow - i) / lastRow : 1;
      const offset =
        SEAWEED_WAVE_AMPLITUDE_PX *
        fromBase *
        Math.sin(waveTime - i * SEAWEED_WAVE_PHASE_PER_ROW);
      row.style.transform = `translateX(${offset.toFixed(2)}px)`;
    }
  });

  return (
    <group position={[params.rootX, BOUND_MIN_Y + 0.6, params.z]}>
      <Html
        center
        distanceFactor={DISTANCE_FACTOR}
        style={{ pointerEvents: "none" }}
        data-cubism-aquarium-html="seaweed"
      >
        <pre
          ref={preRef}
          style={{
            margin: 0,
            fontFamily: MONO_FONT,
            // Slightly larger than fish font so seaweed reads as the
            // background ecosystem the fish swim through.
            fontSize: "13px",
            lineHeight: 1,
            color,
            whiteSpace: "pre",
            textShadow: `0 0 4px ${color}55`,
            userSelect: "none",
            // Anchor sway at the base of the stalk.
            transformOrigin: "center bottom",
            transform: `scaleY(${params.heightScale})`,
            transition: "transform 80ms linear",
          }}
        >
          {performanceMode
            ? stalk
            : rows.map((row, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  // Smooth the per-row offset between throttled frames so the
                  // ripple stays fluid even at 15fps in performance mode.
                  style={{
                    whiteSpace: "pre",
                    transition: "transform 120ms linear",
                  }}
                >
                  {row.length > 0 ? row : " "}
                </div>
              ))}
        </pre>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

type BubbleParams = {
  initial: { x: number; y: number; z: number };
  /** Glyph index — also drives the per-bubble font size. */
  glyphIndex: number;
  riseSpeed: number;
  driftPhase: number;
};

function buildBubbleParams(count: number): BubbleParams[] {
  const out: BubbleParams[] = [];
  for (let i = 0; i < count; i++) {
    // Stagger initial Y so bubbles don't all release simultaneously
    // on first mount — a synchronized wall of bubbles looks glitchy.
    const y = lerp(BOUND_MIN_Y, BOUND_MAX_Y, Math.random());
    out.push({
      initial: {
        x: lerp(BOUND_MIN_X, BOUND_MAX_X, Math.random()),
        y,
        z: lerp(BOUND_MIN_Z, BOUND_MAX_Z, Math.random()),
      },
      glyphIndex: Math.floor(Math.random() * BUBBLE_GLYPHS.length),
      riseSpeed: 0.35 + Math.random() * 0.35,
      driftPhase: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

function Bubble({
  params,
  color,
  performanceMode,
}: {
  params: BubbleParams;
  color: string;
  performanceMode: boolean;
}) {
  const groupRef = useRef<Group>(null);
  const stateRef = useRef({
    x: params.initial.x,
    y: params.initial.y,
    z: params.initial.z,
    accum: 0,
  });

  const frameInterval = performanceMode ? 1 / 30 : 0;

  useFrame((state, deltaSec) => {
    const s = stateRef.current;
    s.accum += deltaSec;
    if (s.accum < frameInterval) return;
    const dt = s.accum;
    s.accum = 0;

    s.y += params.riseSpeed * dt;
    s.x +=
      Math.sin(state.clock.elapsedTime * 1.4 + params.driftPhase) * dt * 0.18;

    if (s.y > BOUND_MAX_Y + 0.2) {
      s.x = lerp(BOUND_MIN_X, BOUND_MAX_X, Math.random());
      s.y = BOUND_MIN_Y - 0.1;
      s.z = lerp(BOUND_MIN_Z, BOUND_MAX_Z, Math.random());
    }

    const g = groupRef.current;
    if (g) {
      g.position.x = s.x;
      g.position.y = s.y;
      g.position.z = s.z;
    }
  });

  const glyph = BUBBLE_GLYPHS[params.glyphIndex] ?? BUBBLE_GLYPHS[0];
  // Bigger glyphs feel closer; we scale slightly by glyph index so
  // the visual variety reinforces depth.
  const fontSize = 10 + params.glyphIndex * 3;

  return (
    <group
      ref={groupRef}
      position={[params.initial.x, params.initial.y, params.initial.z]}
    >
      <Html
        center
        distanceFactor={DISTANCE_FACTOR}
        style={{ pointerEvents: "none" }}
        data-cubism-aquarium-html="bubble"
      >
        <pre
          style={{
            margin: 0,
            fontFamily: MONO_FONT,
            fontSize: `${fontSize}px`,
            lineHeight: 1,
            color,
            whiteSpace: "pre",
            textShadow: `0 0 4px ${color}88`,
            userSelect: "none",
          }}
        >
          {glyph}
        </pre>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function markAquariumFrame() {
  if (typeof window === "undefined") return;
  (
    window as Window & {
      __cubismAquariumLastFrame?: number;
    }
  ).__cubismAquariumLastFrame = Date.now();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function worldToPercent(value: number, min: number, max: number): number {
  const span = max - min || 1;
  const percent = ((value - min) / span) * 100;
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return percent;
}
