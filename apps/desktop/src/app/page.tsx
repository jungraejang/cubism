"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSocket } from "@/lib/socket";

type DeviceStatus = "online" | "offline" | "unknown";

export default function DesktopHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("unknown");
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [format, setFormat] = useState<"12h" | "24h">("12h");
  const [showSeconds, setShowSeconds] = useState(true);

  const userId = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "demo-user";
  const deviceId = process.env.NEXT_PUBLIC_DEMO_DEVICE_ID ?? "pi-holo-001";

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("client:register", {
        role: "desktop",
        userId,
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("device:status", (payload) => {
      if (payload.deviceId !== deviceId) return;
      setDeviceStatus(payload.status);
      setLastSeenAt(payload.lastSeenAt);
    });

    socket.on("command:ack", (payload) => {
      console.log("Command ack:", payload);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("device:status");
      socket.off("command:ack");
      socket.disconnect();
    };
  }, [socket, userId, deviceId]);

  function sendClockModule() {
    socket.emit("module:send-to-device", {
      commandId: crypto.randomUUID(),
      deviceId,
      moduleId: "clock",
      config: {
        format,
        showSeconds,
      },
    });
  }

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto flex max-w-4xl flex-col gap-6 p-8"
      >
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Cubism
          </p>
          <h1 className="mt-3 text-4xl font-bold">Desktop Control Panel</h1>
          <p className="mt-2 text-zinc-400">
            Control your Raspberry Pi-powered holographic assistant.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl"
        >
          <h2 className="text-xl font-semibold">Connection</h2>

          <div className="mt-4 grid gap-3 text-sm text-zinc-300">
            <div className="flex items-center gap-3">
              <motion.span
                animate={{ scale: connected ? [1, 1.25, 1] : 1 }}
                transition={{ repeat: connected ? Infinity : 0, duration: 1.5 }}
                className={`h-3 w-3 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
              />
              <span>
                Socket server: {connected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <p>
              Device <span className="font-mono">{deviceId}</span>:{" "}
              {deviceStatus}
            </p>

            {lastSeenAt && (
              <p className="text-zinc-500">
                Last seen: {new Date(lastSeenAt).toLocaleString()}
              </p>
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-cyan-400/20 bg-zinc-900/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08)]"
        >
          <h2 className="text-xl font-semibold">Clock Module</h2>

          <div className="mt-4 flex flex-col gap-4">
            <label className="flex items-center gap-3">
              <span className="w-32 text-zinc-400">Format</span>
              <select
                className="rounded-lg bg-zinc-800 px-3 py-2 text-white"
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as "12h" | "24h")
                }
              >
                <option value="12h">12 hour</option>
                <option value="24h">24 hour</option>
              </select>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={showSeconds}
                onChange={(event) => setShowSeconds(event.target.checked)}
              />
              <span>Show seconds</span>
            </label>

            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              onClick={sendClockModule}
              className="w-fit rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-300"
            >
              Display Clock on Hologram
            </motion.button>
          </div>
        </motion.section>
      </motion.div>
    </main>
  );
}
