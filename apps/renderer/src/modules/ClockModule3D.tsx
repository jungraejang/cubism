"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, Float, Text3D } from "@react-three/drei";
import * as THREE from "three";
import type { ClockModuleConfig } from "@cubism/protocol";
import { createHologramMaterial } from "./hologramMaterial";

type Props = { config: ClockModuleConfig };

const FONT_URL = "/fonts/helvetiker_bold.typeface.json";
const CHAR_WIDTH = 0.65;
const FALL_DURATION_S = 0.3;
const FALL_HEIGHT = 0.6;

type FallingCharProps = {
  char: string;
  x: number;
  y: number;
  size: number;
  height: number;
  material: THREE.Material;
};

/**
 * One glyph cell. Slides in from above when its character changes, then sits
 * statically in its cell. We use a fixed-width layout (CHAR_WIDTH per cell)
 * so changing digits never shift the surrounding text.
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
  // null = idle, 0..1 = currently animating fall.
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
    // Ease-out cubic.
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

type RingProps = {
  material: THREE.Material;
  radius: number;
  tube: number;
  rotation: [number, number, number];
  speed: number;
};

function Ring({ material, radius, tube, rotation, speed }: RingProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += speed * delta;
  });

  return (
    <mesh ref={ref} rotation={rotation}>
      <torusGeometry args={[radius, tube, 16, 96]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * Drives uTime uniforms for every hologram material in the scene from a
 * single useFrame loop. Cheaper than letting each material run its own.
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

  // Materials are reused across all glyphs and rings - create once.
  const timeMat = useMemo(
    () => createHologramMaterial({ intensity: 1.6, opacity: 0.95 }),
    [],
  );
  const dateMat = useMemo(
    () => createHologramMaterial({ intensity: 0.9, opacity: 0.8 }),
    [],
  );
  const ringMat = useMemo(
    () => createHologramMaterial({ intensity: 0.8, opacity: 0.55 }),
    [],
  );

  useEffect(() => {
    return () => {
      timeMat.dispose();
      dateMat.dispose();
      ringMat.dispose();
    };
  }, [timeMat, dateMat, ringMat]);

  const chars = useMemo(() => time.split(""), [time]);
  const totalWidth = chars.length * CHAR_WIDTH;
  const startX = -totalWidth / 2 + CHAR_WIDTH / 2;

  return (
    <>
      <color attach="background" args={["#000"]} />
      <ambientLight intensity={0.4} />

      <HologramTimeDriver materials={[timeMat, dateMat, ringMat]} />

      <Float
        speed={1.4}
        rotationIntensity={0.15}
        floatIntensity={0.35}
        floatingRange={[-0.08, 0.08]}
      >
        <group position={[0, 0.5, 0]}>
          {chars.map((char, i) => (
            <FallingChar
              key={i}
              char={char}
              x={startX + i * CHAR_WIDTH}
              y={0}
              size={0.9}
              height={0.1}
              material={timeMat}
            />
          ))}
        </group>

        <Center position={[0, -1.1, 0]}>
          <Text3D
            font={FONT_URL}
            size={0.28}
            height={0.04}
            bevelEnabled
            bevelSize={0.006}
            bevelSegments={2}
            curveSegments={4}
            letterSpacing={0.08}
          >
            {date.toUpperCase()}
            <primitive object={dateMat} attach="material" />
          </Text3D>
        </Center>

        <Ring
          material={ringMat}
          radius={3.6}
          tube={0.02}
          rotation={[Math.PI / 2.4, 0, 0]}
          speed={0.18}
        />
        <Ring
          material={ringMat}
          radius={3.05}
          tube={0.015}
          rotation={[-Math.PI / 2.3, Math.PI / 5, 0]}
          speed={-0.12}
        />
      </Float>
    </>
  );
}

/**
 * Three.js hologram clock. Wrapped externally by ClockModule.tsx which applies
 * the rotation / mirror DOM transform on the surrounding container, so this
 * component only needs to fill its parent.
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
