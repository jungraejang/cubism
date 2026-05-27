"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import { ClockModule } from "@/modules/ClockModule";
import type { ClockModuleConfig } from "@cubism/protocol";

type ActiveModule = {
  moduleId: "clock";
  config: ClockModuleConfig;
} | null;

export default function RendererHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>({
    moduleId: "clock",
    config: {
      format: "12h",
      showSeconds: true,
    },
  });

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
      if (payload.moduleId === "clock") {
        setActiveModule({
          moduleId: "clock",
          config: payload.config,
        });

        socket.emit("device:heartbeat", {
          deviceId,
          currentModuleId: payload.moduleId,
          timestamp: new Date().toISOString(),
        });
      }
    });

    const heartbeatInterval = window.setInterval(() => {
      socket.emit("device:heartbeat", {
        deviceId,
        currentModuleId: activeModule?.moduleId,
        timestamp: new Date().toISOString(),
      });
    }, 10_000);

    return () => {
      window.clearInterval(heartbeatInterval);
      socket.off("connect");
      socket.off("disconnect");
      socket.off("module:display");
      socket.disconnect();
    };
  }, [socket, deviceId, activeModule?.moduleId]);

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

  return (
    <AnimatePresence mode="wait">
      {activeModule?.moduleId === "clock" ? (
        <ClockModule key="clock" config={activeModule.config} />
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
