"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, Float, Text3D } from "@react-three/drei";
import * as THREE from "three";
import type { ClockModuleConfig } from "@cubism/protocol";
import { createHologramMaterial } from "./hologramMaterial";

type Props = { config: ClockModuleConfig };

const FONT_URL = "/fonts/helvetiker_bold.typeface.json";

/**
 * Each visual layer sits at a different Z so the gentle scene sway from
 * <Float> parallaxes them, making the depth visible. Positive Z = closer to
 * camera; positions are scene units (camera is at z = 8).
 */
const Z = {
  glow: -1.5,
  ringOuter: -0.5,
  ringMid: -0.25,
  ringInner: -0.1,
  date: 0.0,
  time: 0.7,
} as const;

const SCENE_RADIUS = 3.0;
const CHAR_WIDTH = 0.65;
const FALL_DURATION_S = 0.3;
const FALL_HEIGHT = 0.5;

type FallingCharProps = {
  char: string;
  x: number;
  y: number;
  size: number;
  height: number;
  material: THREE.Material;
};

/**
 * One glyph cell with fixed width. Slides in from above when its character
 * changes; idle otherwise. The whole row is parented inside the time group
 * which lives at Z.time (closest to the camera).
 */
function FallingChar({
  char,
  x,
  y,
  size,
  height,
  material,
}: FallingCharProps) {
  const groupRef = useRef<THREE.Group>(null);
  const prevCharRef = useRef(char);
  const animProgressRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevCharRef.current !== char) {
      animProgressRef.current = 0;
      prevCharRef.current = char;
    }
  }, [char]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (animProgressRef.current === null) {
      groupRef.current.position.y = y;
      return;
    }
    animProgressRef.current += delta / FALL_DURATION_S;
    if (animProgressRef.current >= 1) {
      groupRef.current.position.y = y;
      animProgressRef.current = null;
      return;
    }
    const eased = 1 - Math.pow(1 - animProgressRef.current, 3);
    groupRef.current.position.y = y + FALL_HEIGHT * (1 - eased);
  });

  return (
    <group ref={groupRef} position={[x, y, 0]}>
      <Center>
        <Text3D
          font={FONT_URL}
          size={size}
          height={height}
          bevelEnabled
          bevelSize={0.012}
          bevelSegments={2}
          curveSegments={6}
        >
          {char}
          <primitive object={material} attach="material" />
        </Text3D>
      </Center>
    </group>
  );
}

type SpinningRingProps = {
  material: THREE.Material;
  radius: number;
  tube: number;
  z: number;
  speed: number;
};

/**
 * A thin torus facing the camera, spinning slowly around the view axis. The
 * tiny `tube` thickness keeps the geometry essentially flat (like the CSS
 * dashed rings) while still having proper normals for the hologram shader's
 * fresnel rim effect.
 */
function SpinningRing({
  material,
  radius,
  tube,
  z,
  speed,
}: SpinningRingProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += speed * delta;
  });

  return (
    <mesh ref={ref} position={[0, 0, z]}>
      <torusGeometry args={[radius, tube, 10, 128]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * Drives the shared uTime uniform for every hologram material in the scene
 * from a single useFrame loop.
 */
function HologramTimeDriver({
  materials,
}: {
  materials: THREE.ShaderMaterial[];
}) {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const m of materials) {
      m.uniforms.uTime.value = t;
    }
  });
  return null;
}

function Scene({ config }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: config.showSeconds ? "2-digit" : undefined,
      hour12: config.format === "12h",
      timeZone: config.timezone,
    }).format(now);
  }, [now, config]);

  const date = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: config.timezone,
    }).format(now);
  }, [now, config]);

  // Bright cyan for the time, dimmer for everything else.
  const timeMat = useMemo(
    () => createHologramMaterial({ intensity: 1.7, opacity: 0.95 }),
    [],
  );
  const dateMat = useMemo(
    () => createHologramMaterial({ intensity: 1.0, opacity: 0.85 }),
    [],
  );
  const ringOuterMat = useMemo(
    () => createHologramMaterial({ intensity: 1.2, opacity: 0.85 }),
    [],
  );
  const ringInnerMat = useMemo(
    () => createHologramMaterial({ intensity: 0.7, opacity: 0.55 }),
    [],
  );
  // Soft halo behind everything - additive cyan with low opacity.
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#22d3ee",
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      timeMat.dispose();
      dateMat.dispose();
      ringOuterMat.dispose();
      ringInnerMat.dispose();
      glowMat.dispose();
    };
  }, [timeMat, dateMat, ringOuterMat, ringInnerMat, glowMat]);

  const chars = useMemo(() => time.split(""), [time]);
  const totalWidth = chars.length * CHAR_WIDTH;
  const startX = -totalWidth / 2 + CHAR_WIDTH / 2;

  return (
    <>
      <color attach="background" args={["#000"]} />
      <ambientLight intensity={0.4} />

      <HologramTimeDriver
        materials={[timeMat, dateMat, ringOuterMat, ringInnerMat]}
      />

      {/*
       * Float gently sways and tilts the entire scene. Because each layer is
       * at a different Z, the tilt makes them parallax-shift relative to each
       * other - that's where the "floating in 3D" feel comes from.
       */}
      <Float
        speed={1.1}
        rotationIntensity={0.35}
        floatIntensity={0.4}
        floatingRange={[-0.06, 0.06]}
      >
        {/* Back: soft cyan glow disc (matches CSS box-shadow halo). */}
        <mesh position={[0, 0, Z.glow]}>
          <circleGeometry args={[SCENE_RADIUS * 1.4, 64]} />
          <primitive object={glowMat} attach="material" />
        </mesh>

        {/* Outer "border" ring - the main cyan circle from the CSS version. */}
        <SpinningRing
          material={ringOuterMat}
          radius={SCENE_RADIUS}
          tube={0.025}
          z={Z.ringOuter}
          speed={0.05}
        />

        {/* Two inner accent rings (the dashed cyan-300/20 + cyan-300/10 in CSS). */}
        <SpinningRing
          material={ringInnerMat}
          radius={SCENE_RADIUS * 0.78}
          tube={0.012}
          z={Z.ringMid}
          speed={-0.12}
        />
        <SpinningRing
          material={ringInnerMat}
          radius={SCENE_RADIUS * 0.6}
          tube={0.008}
          z={Z.ringInner}
          speed={0.18}
        />

        {/* Date - mid depth, just behind the time. */}
        <Center position={[0, -1.15, Z.date]}>
          <Text3D
            font={FONT_URL}
            size={0.26}
            height={0.04}
            bevelEnabled
            bevelSize={0.005}
            bevelSegments={2}
            curveSegments={4}
            letterSpacing={0.08}
          >
            {date.toUpperCase()}
            <primitive object={dateMat} attach="material" />
          </Text3D>
        </Center>

        {/* Time - closest to camera, with per-digit fall animation. */}
        <group position={[0, 0.25, Z.time]}>
          {chars.map((char, i) => (
            <FallingChar
              key={i}
              char={char}
              x={startX + i * CHAR_WIDTH}
              y={0}
              size={0.85}
              height={0.1}
              material={timeMat}
            />
          ))}
        </group>
      </Float>
    </>
  );
}

/**
 * Three.js hologram clock. Mirrors the CSS clock's composition (glowing disc,
 * concentric rings, centered time, date below) but at different Z depths so
 * the scene's idle sway reveals true 3D parallax.
 */
export function ClockModule3D({ config }: Props) {
  return (
    <div className="h-full w-full bg-black">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 8], fov: 45 }}
      >
        <Suspense fallback={null}>
          <Scene config={config} />
        </Suspense>
      </Canvas>
    </div>
  );
}
