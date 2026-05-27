"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import type { ClockModuleConfig } from "@cubism/protocol";
import { ClockModuleCss } from "./ClockModuleCss";

// Three.js bundle is ~250 KB; only load it when the desktop actually picks
// the "three" renderer. ssr: false because @react-three/fiber needs WebGL.
const ClockModule3D = dynamic(
  () => import("./ClockModule3D").then((m) => m.ClockModule3D),
  { ssr: false },
);

type Props = {
  config: ClockModuleConfig;
};

/**
 * Dispatcher: picks the requested renderer (CSS default, Three.js opt-in) and
 * applies the shared rotation / mirror transform so each implementation only
 * has to worry about its own visuals.
 */
export function ClockModule({ config }: Props) {
  const rotation = config.rotation ?? 0;
  const scaleX = config.flipHorizontal ? -1 : 1;
  const scaleY = config.flipVertical ? -1 : 1;
  const renderer = config.renderer ?? "css";

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      <motion.div
        animate={{ rotate: rotation, scaleX, scaleY }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        {renderer === "three" ? (
          <ClockModule3D config={config} />
        ) : (
          <ClockModuleCss config={config} />
        )}
      </motion.div>
    </div>
  );
}
