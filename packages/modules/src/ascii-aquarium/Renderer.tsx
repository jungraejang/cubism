"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import type { RendererProps } from "../types";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_BUBBLE_RATE,
  DEFAULT_FISH_COUNT,
  DEFAULT_PERFORMANCE_MODE,
  DEFAULT_SEAWEED_COLOR,
  DEFAULT_SEAWEED_COUNT,
  NORMAL_CAPS,
  PERF_CAPS,
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
 * Aquarium volume bounds in Three.js world units.
 *  - Fish: roam within these in X/Y, fixed Z per instance.
 *  - Seaweed: rooted at y=BOUND_MIN_Y, only sway laterally.
 *  - Bubbles: respawn at y=BOUND_MIN_Y when they reach y=BOUND_MAX_Y.
 */
const BOUND_MIN_X = -3.6;
const BOUND_MAX_X = 3.6;
const BOUND_MIN_Y = -2.0;
const BOUND_MAX_Y = 2.0;
const BOUND_MIN_Z = -1.8;
const BOUND_MAX_Z = 1.5;

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
  const caps = performanceMode ? PERF_CAPS : NORMAL_CAPS;

  const fishCount = Math.min(
    config.fishCount ?? DEFAULT_FISH_COUNT,
    caps.fishCount,
  );
  const seaweedCount = Math.min(
    config.seaweedCount ?? DEFAULT_SEAWEED_COUNT,
    caps.seaweedCount,
  );
  // Bubble pool derived from the user's bubble-per-minute setting.
  // Pool size is fixed; bubbles recycle when they reach the surface
  // (no spawn/despawn churn at run time).
  const bubbleRate = config.bubbleRate ?? DEFAULT_BUBBLE_RATE;
  const bubblePoolSize = Math.min(
    Math.max(1, Math.ceil(bubbleRate * 0.18)),
    caps.bubblePoolSize,
  );

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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{ duration: PIXEL_SHIFT_DURATION_S, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        <motion.div
          initial={false}
          animate={{ rotate: rotation, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0"
          style={{ background: backgroundColor }}
        >
          <Canvas
            dpr={dpr}
            camera={{ position: [0, 0, 5], fov: 50, near: 0.1, far: 100 }}
            // Antialiasing on text is handled by the browser's font
            // rasterizer (HTML `<pre>`), so the GL antialias setting
            // is mostly cosmetic for any future 3D meshes we add.
            gl={{ antialias: !performanceMode, alpha: true }}
            style={{ background: backgroundColor }}
          >
            <Scene
              fishCount={fishCount}
              seaweedCount={seaweedCount}
              bubblePoolSize={bubblePoolSize}
              seaweedColor={seaweedColor}
              bubbleColor={bubbleColor}
              performanceMode={performanceMode}
            />
          </Canvas>
        </motion.div>
      </motion.div>
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
  seaweedCount,
  bubblePoolSize,
  seaweedColor,
  bubbleColor,
  performanceMode,
}: {
  fishCount: number;
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

  return (
    <>
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
        z: lerp(BOUND_MIN_Z, BOUND_MAX_Z, Math.random()),
      },
      phaseMs: Math.random() * WIGGLE_PERIOD_MS,
      target: pickFishTarget(),
      speed: 0.35 + Math.random() * 0.4,
    });
  }
  return out;
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
  performanceMode,
}: {
  params: FishParams;
  performanceMode: boolean;
}) {
  const groupRef = useRef<Group>(null);
  // The visible <pre> whose textContent we mutate every wiggle tick.
  // Direct DOM mutation avoids the React re-render that setState
  // would otherwise schedule ~4 times per second per fish.
  const preRef = useRef<HTMLPreElement>(null);
  // The wrapper <div> we apply scaleX(-1) to when swimming left, so
  // the fish glyphs visually face the direction of travel.
  const facingRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    x: params.initial.x,
    y: params.initial.y,
    z: params.initial.z,
    target: params.target,
    /** +1 = right, -1 = left. Drives the CSS X-scale flip on facingRef. */
    facing: 1 as 1 | -1,
    accum: 0,
    wiggleAccumMs: 0,
    showFrameB: false,
    timeSinceTargetSwitch: 0,
  });

  const species = FISH_SPECIES[params.speciesIndex] ?? FISH_SPECIES[0];

  const frameInterval = performanceMode ? 1 / 30 : 0;

  useFrame((_state, deltaSec) => {
    const s = stateRef.current;
    s.accum += deltaSec;
    if (s.accum < frameInterval) return;
    const dt = s.accum;
    s.accum = 0;

    // Steer toward the current waypoint.
    const dx = s.target.x - s.x;
    const dy = s.target.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.25) {
      s.target = pickFishTarget();
      s.timeSinceTargetSwitch = 0;
    } else {
      const step = params.speed * dt;
      s.x += (dx / dist) * step;
      s.y += (dy / dist) * step;
    }
    s.timeSinceTargetSwitch += dt;
    if (s.timeSinceTargetSwitch > 6) {
      // Periodic kick to a fresh target even if not reached — keeps
      // fish from getting stuck on slow trajectories.
      s.target = pickFishTarget();
      s.timeSinceTargetSwitch = 0;
    }

    // Update facing based on horizontal motion direction. We apply
    // it as a CSS transform on the inner div (not the Three.js group)
    // because mirroring the Three group would also mirror its child
    // Html overlay's position calculations.
    const newFacing: 1 | -1 = dx < 0 ? -1 : 1;
    if (newFacing !== s.facing) {
      s.facing = newFacing;
      if (facingRef.current) {
        facingRef.current.style.transform = `scaleX(${newFacing})`;
      }
    }

    // Wiggle frame swap. Per-fish phase keeps the school out of sync.
    s.wiggleAccumMs += dt * 1000;
    if (s.wiggleAccumMs >= WIGGLE_PERIOD_MS) {
      s.wiggleAccumMs -= WIGGLE_PERIOD_MS;
      s.showFrameB = !s.showFrameB;
      if (preRef.current) {
        preRef.current.textContent = s.showFrameB ? species.b : species.a;
      }
    }

    const g = groupRef.current;
    if (g) {
      // Micro-bob on Y gives a buoyant feel even when moving mostly
      // horizontally. Phase derived from per-fish offset.
      const bob = Math.sin((s.wiggleAccumMs / 1000) * 4 + params.phaseMs) * 0.04;
      g.position.x = s.x;
      g.position.y = s.y + bob;
      g.position.z = s.z;
    }
  });

  const baseFontSize = Math.round(11 * species.scale);

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
            {species.a}
          </pre>
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

  // Slower throttle for seaweed — the human eye can't tell the
  // difference between 20 and 60 fps on this kind of gentle sway.
  const frameInterval = performanceMode ? 1 / 15 : 1 / 30;
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
    pre.style.transform = `skewX(${skewDeg}deg)`;
  });

  return (
    <group position={[params.rootX, BOUND_MIN_Y + 0.6, params.z]}>
      <Html
        center
        distanceFactor={DISTANCE_FACTOR}
        style={{ pointerEvents: "none" }}
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
            transition: "transform 80ms linear",
          }}
        >
          {stalk}
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
    s.x += Math.sin(state.clock.elapsedTime * 1.4 + params.driftPhase) * dt * 0.18;

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
