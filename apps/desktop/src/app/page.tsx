"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import { modules } from "@cubism/modules";

type DeviceStatus = "online" | "offline" | "unknown";

type ConfigByModule = Record<string, unknown>;

export default function DesktopHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("unknown");
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(
    modules[0].manifest.id,
  );
  const [configByModule, setConfigByModule] = useState<ConfigByModule>(() =>
    Object.fromEntries(
      modules.map((m) => [m.manifest.id, m.manifest.defaultConfig]),
    ),
  );

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

  const selected =
    modules.find((m) => m.manifest.id === selectedId) ?? modules[0];
  const SelectedControls = selected.Controls;
  const currentConfig = configByModule[selected.manifest.id];

  function sendToDevice() {
    socket.emit("module:send-to-device", {
      commandId: crypto.randomUUID(),
      deviceId,
      moduleId: selected.manifest.id,
      config: currentConfig,
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

        {modules.length > 1 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6"
          >
            <h2 className="text-xl font-semibold">Modules</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Select a module to configure.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {modules.map((m) => {
                const active = m.manifest.id === selected.manifest.id;
                return (
                  <motion.button
                    key={m.manifest.id}
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.04 }}
                    onClick={() => setSelectedId(m.manifest.id)}
                    aria-pressed={active}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-cyan-400 text-zinc-950"
                        : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {m.manifest.name}
                  </motion.button>
                );
              })}
            </div>
          </motion.section>
        )}

        <motion.section
          key={selected.manifest.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-cyan-400/20 bg-zinc-900/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">
              {selected.manifest.name} Module
            </h2>
            <span className="text-xs text-zinc-500">
              v{selected.manifest.version}
            </span>
          </div>
          {selected.manifest.description && (
            <p className="mt-1 text-sm text-zinc-500">
              {selected.manifest.description}
            </p>
          )}

          <div className="mt-4">
            <SelectedControls
              config={currentConfig}
              onChange={(next) =>
                setConfigByModule((prev) => ({
                  ...prev,
                  [selected.manifest.id]: next,
                }))
              }
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            onClick={sendToDevice}
            className="mt-6 w-fit rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-300"
          >
            Send {selected.manifest.name} to Hologram
          </motion.button>
        </motion.section>
      </motion.div>
    </main>
  );
}
