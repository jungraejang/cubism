"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import { modules, type AnyCubismModule } from "@cubism/modules";

type ActiveModule = {
  module: AnyCubismModule;
  config: unknown;
};

export default function RendererHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState<ActiveModule | null>(null);

  const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID ?? "pi-holo-001";

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setConnected(true);

      socket.emit("client:register", {
        role: "renderer",
        deviceId,
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("module:display", (payload) => {
      const mod = modules.find((m) => m.manifest.id === payload.moduleId);
      if (!mod) {
        console.warn(
          `[renderer] received module:display for unknown module "${payload.moduleId}"`,
        );
        return;
      }

      const parsed = mod.configSchema.safeParse(payload.config);
      if (!parsed.success) {
        console.warn(
          `[renderer] invalid config for module "${payload.moduleId}":`,
          parsed.error,
        );
        return;
      }

      setActive({ module: mod, config: parsed.data });

      socket.emit("device:heartbeat", {
        deviceId,
        currentModuleId: payload.moduleId,
        timestamp: new Date().toISOString(),
      });
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("module:display");
      socket.disconnect();
    };
  }, [socket, deviceId]);

  useEffect(() => {
    const heartbeatInterval = window.setInterval(() => {
      socket.emit("device:heartbeat", {
        deviceId,
        currentModuleId: active?.module.manifest.id,
        timestamp: new Date().toISOString(),
      });
    }, 10_000);
    return () => window.clearInterval(heartbeatInterval);
  }, [socket, deviceId, active]);

  if (!connected) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black text-cyan-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-4xl font-bold"
          >
            Cubism Renderer
          </motion.div>
          <div className="mt-4 text-cyan-100/60">
            Connecting to socket server...
          </div>
        </motion.div>
      </main>
    );
  }

  const ActiveRenderer = active?.module.Renderer;

  return (
    <AnimatePresence mode="wait">
      {ActiveRenderer && active ? (
        <ActiveRenderer key={active.module.manifest.id} config={active.config} />
      ) : (
        <motion.main
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex h-screen w-screen items-center justify-center bg-black text-white"
        >
          No active module
        </motion.main>
      )}
    </AnimatePresence>
  );
}
