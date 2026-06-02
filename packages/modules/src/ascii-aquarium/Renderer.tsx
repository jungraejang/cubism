"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { RendererProps } from "../types";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_BUBBLE_RATE,
  DEFAULT_FISH_COUNT,
  DEFAULT_FISH_SPEED,
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
 * Aquarium volume bounds in abstract world units. Fish roam in X/Y; Z
 * drives a CSS depth scale only (no WebGL).
 */
const BOUND_MIN_X = -2.4;
const BOUND_MAX_X = 2.4;
const BOUND_MIN_Y = -1.5;
const BOUND_MAX_Y = 1.5;

const FISH_Z_MIN = -0.25;
const FISH_Z_MAX = 1;

const FISH_DEPTH_SCALE_MIN = 0.55;
const FISH_DEPTH_SCALE_MAX = 1.1;

const MONO_FONT =
  'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';

const DOM_FISH_FONT_PX = 26;
const DOM_SEAWEED_FONT_PX = 23;
const DOM_BUBBLE_FONT_BASE_PX = 18;
const DOM_FISH_BOUND_MIN_X = BOUND_MIN_X + 0.85;
const DOM_FISH_BOUND_MAX_X = BOUND_MAX_X - 1.1;
const DOM_FISH_BOUND_MIN_Y = BOUND_MIN_Y + 0.65;
const DOM_FISH_BOUND_MAX_Y = BOUND_MAX_Y - 0.55;

const FISH_SEPARATION_RADIUS = 0.85;

/** Shared, mutable fish positions keyed by fish index (x/y world units). */
type FishPositions = ({ x: number; y: number } | null)[];

export function AsciiAquariumRenderer({
  config,
}: RendererProps<AsciiAquariumConfig>) {
  const rotation = config.rotation ?? 0;
  const scaleX = config.flipHorizontal ? -1 : 1;
  const scaleY = config.flipVertical ? -1 : 1;

  const fishCount = config.fishCount ?? DEFAULT_FISH_COUNT;
  const fishSpeed = config.fishSpeed ?? DEFAULT_FISH_SPEED;
  const seaweedCount = config.seaweedCount ?? DEFAULT_SEAWEED_COUNT;
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

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden"
      style={{ background: backgroundColor }}
    >
      <motion.div
        initial={false}
        animate={{ x: pixelShift.x, y: pixelShift.y }}
        transition={{
          duration: PIXEL_SHIFT_DURATION_S,
          ease: "easeInOut",
        }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          initial={false}
          animate={{ rotate: rotation, scaleX, scaleY }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="relative h-[90vmin] w-[90vmin] max-h-screen max-w-screen overflow-hidden"
          style={{
            background: backgroundColor,
            perspective: "none",
            transformStyle: "flat",
          }}
        >
          <AquariumScene
            fishCount={fishCount}
            fishSpeed={fishSpeed}
            seaweedCount={seaweedCount}
            bubblePoolSize={bubblePoolSize}
            seaweedColor={seaweedColor}
            bubbleColor={bubbleColor}
            backgroundColor={backgroundColor}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

function AquariumScene({
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
  const fishPositionsRef = useRef<FishPositions>([]);
  if (fishPositionsRef.current.length !== fishParams.length) {
    fishPositionsRef.current = new Array(fishParams.length).fill(null);
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: backgroundColor }}
    >
      <style>{`
        @keyframes cubism-dom-seaweed-sway {
          0%, 100% { transform: skewX(-5deg) scaleY(var(--height-scale)); }
          50% { transform: skewX(5deg) scaleY(var(--height-scale)); }
        }
        @keyframes cubism-dom-fish-wave {
          0%, 100% { transform: translateY(calc(var(--wave-amp) * -1)); }
          50% { transform: translateY(var(--wave-amp)); }
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
            key={`seaweed-${i}`}
            style={{
              position: "absolute",
              left: `${worldToPercent(params.rootX, BOUND_MIN_X, BOUND_MAX_X)}%`,
              bottom: "10%",
              margin: 0,
              fontFamily: MONO_FONT,
              fontSize: `${DOM_SEAWEED_FONT_PX}px`,
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

      {fishParams.map((params, i) => (
        <AquariumFish
          key={`fish-${i}`}
          params={params}
          index={i}
          positions={fishPositionsRef.current}
          fishSpeed={fishSpeed}
        />
      ))}

      {bubbleParams.map((params, i) => {
        const glyph = BUBBLE_GLYPHS[params.glyphIndex] ?? BUBBLE_GLYPHS[0];
        return (
          <pre
            key={`bubble-${i}`}
            style={{
              position: "absolute",
              left: `${worldToPercent(params.initial.x, BOUND_MIN_X, BOUND_MAX_X)}%`,
              top: `${100 - worldToPercent(params.initial.y, BOUND_MIN_Y, BOUND_MAX_Y)}%`,
              margin: 0,
              fontFamily: MONO_FONT,
              fontSize: `${DOM_BUBBLE_FONT_BASE_PX + params.glyphIndex * 6}px`,
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

function AquariumFish({
  params,
  index,
  positions,
  fishSpeed,
}: {
  params: FishParams;
  index: number;
  positions: FishPositions;
  fishSpeed: number;
}) {
  const species = FISH_SPECIES[params.speciesIndex] ?? FISH_SPECIES[0];
  const frameChars = useMemo(() => species.a.split(""), [species.a]);
  const [state, setState] = useState(() => ({
    x: clamp(params.initial.x, DOM_FISH_BOUND_MIN_X, DOM_FISH_BOUND_MAX_X),
    y: clamp(params.initial.y, DOM_FISH_BOUND_MIN_Y, DOM_FISH_BOUND_MAX_Y),
    z: params.initial.z,
    facing: params.target.x < params.initial.x ? -1 : 1,
    durationMs: 2800,
  }));

  useEffect(() => {
    return () => {
      positions[index] = null;
    };
  }, [index, positions]);

  useEffect(() => {
    positions[index] = { x: state.x, y: state.y };
  }, [index, positions, state.x, state.y]);

  useEffect(() => {
    let timeoutId: number | null = null;
    let cancelled = false;

    const baseIntervalMs = Math.max(1600, 3400 / Math.max(0.25, fishSpeed));
    const scheduleNext = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        moveOnce();
        scheduleNext(baseIntervalMs * (0.65 + Math.random() * 0.85));
      }, delayMs);
    };

    const moveOnce = () => {
      setState((prev) => {
        const maxStepX = 1.25;
        const maxStepY = 0.65;
        let nextX = clamp(
          prev.x + (Math.random() - 0.5) * maxStepX * 2,
          DOM_FISH_BOUND_MIN_X,
          DOM_FISH_BOUND_MAX_X,
        );
        let nextY = clamp(
          prev.y + (Math.random() - 0.5) * maxStepY * 2,
          DOM_FISH_BOUND_MIN_Y,
          DOM_FISH_BOUND_MAX_Y,
        );
        const separation = getFishSeparation(index, positions, nextX, nextY);
        nextX = clamp(
          nextX + separation.x,
          DOM_FISH_BOUND_MIN_X,
          DOM_FISH_BOUND_MAX_X,
        );
        nextY = clamp(
          nextY + separation.y,
          DOM_FISH_BOUND_MIN_Y,
          DOM_FISH_BOUND_MAX_Y,
        );
        const facing = nextX < prev.x ? -1 : 1;
        positions[index] = { x: nextX, y: nextY };
        return {
          x: nextX,
          y: nextY,
          z: lerp(FISH_Z_MIN, FISH_Z_MAX, Math.random()),
          facing,
          durationMs: baseIntervalMs * (0.7 + Math.random() * 0.75),
        };
      });
    };

    const initialDelayMs =
      (params.phaseMs % baseIntervalMs) + index * 137 + Math.random() * 900;
    scheduleNext(initialDelayMs);

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [fishSpeed, index, params.phaseMs, positions]);

  return (
    <div
      style={{
        position: "absolute",
        left: `${clamp(
          worldToPercent(state.x, BOUND_MIN_X, BOUND_MAX_X),
          9,
          78,
        )}%`,
        top: `${clamp(
          100 - worldToPercent(state.y, BOUND_MIN_Y, BOUND_MAX_Y),
          10,
          82,
        )}%`,
        margin: 0,
        transform: `scale(${depthScaleForZ(state.z).toFixed(3)})`,
        transformOrigin: "center center",
        transition: `left ${state.durationMs.toFixed(
          0,
        )}ms ease-in-out, top ${state.durationMs.toFixed(
          0,
        )}ms ease-in-out, transform ${state.durationMs.toFixed(0)}ms ease-in-out`,
      }}
    >
      <pre
        style={{
          margin: 0,
          fontFamily: MONO_FONT,
          fontSize: `${Math.round(DOM_FISH_FONT_PX * species.scale)}px`,
          lineHeight: 1,
          color: params.color,
          whiteSpace: "pre",
          textShadow: `0 0 6px ${params.color}66`,
          userSelect: "none",
          transform: `scaleX(${state.facing})`,
          transformOrigin: "center center",
        }}
      >
        {frameChars.map((ch, i) => (
          <span
            key={`${i}-${ch}`}
            style={{
              display: "inline-block",
              animation: `cubism-dom-fish-wave 520ms ease-in-out ${(
                -i * 0.07
              ).toFixed(2)}s infinite`,
              ["--wave-amp" as string]: `${Math.max(
                1,
                DOM_FISH_FONT_PX * species.scale * 0.08,
              ).toFixed(1)}px`,
            }}
          >
            {ch}
          </span>
        ))}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity parameter builders
// ---------------------------------------------------------------------------

type FishParams = {
  speciesIndex: number;
  color: string;
  initial: { x: number; y: number; z: number };
  phaseMs: number;
  target: { x: number; y: number };
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
    });
  }
  return out;
}

type SeaweedParams = {
  speciesIndex: number;
  rootX: number;
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
      phase: Math.random() * Math.PI * 2,
      speedMul: 0.9 + Math.random() * 0.3,
      heightScale: lerp(0.7, 1.35, Math.random()),
    });
  }
  return out;
}

type BubbleParams = {
  initial: { x: number; y: number };
  glyphIndex: number;
  riseSpeed: number;
  driftPhase: number;
};

function buildBubbleParams(count: number): BubbleParams[] {
  const out: BubbleParams[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      initial: {
        x: lerp(BOUND_MIN_X, BOUND_MAX_X, Math.random()),
        y: lerp(BOUND_MIN_Y, BOUND_MAX_Y, Math.random()),
      },
      glyphIndex: Math.floor(Math.random() * BUBBLE_GLYPHS.length),
      riseSpeed: 0.35 + Math.random() * 0.35,
      driftPhase: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

function pickFishTarget(): { x: number; y: number } {
  return {
    x: lerp(BOUND_MIN_X + 0.4, BOUND_MAX_X - 0.4, Math.random()),
    y: lerp(BOUND_MIN_Y + 0.7, BOUND_MAX_Y - 0.5, Math.random()),
  };
}

function depthScaleForZ(z: number): number {
  const span = FISH_Z_MAX - FISH_Z_MIN || 1;
  let t = (z - FISH_Z_MIN) / span;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return lerp(FISH_DEPTH_SCALE_MIN, FISH_DEPTH_SCALE_MAX, t);
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

function getFishSeparation(
  index: number,
  positions: FishPositions,
  x: number,
  y: number,
): { x: number; y: number } {
  let pushX = 0;
  let pushY = 0;
  const radius = FISH_SEPARATION_RADIUS * 0.95;

  for (let i = 0; i < positions.length; i++) {
    if (i === index) continue;
    const other = positions[i];
    if (!other) continue;
    const dx = x - other.x;
    const dy = y - other.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 1e-6 || d2 >= radius * radius) continue;
    const d = Math.sqrt(d2);
    const strength = (radius - d) / radius;
    pushX += (dx / d) * strength * 0.8;
    pushY += (dy / d) * strength * 0.45;
  }

  return { x: pushX, y: pushY };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
