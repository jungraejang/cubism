"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import { modules, randomId, type ModuleStream } from "@cubism/modules";

type DeviceStatus = "online" | "offline" | "unknown";

type ConfigByModule = Record<string, unknown>;

function buildDefaultConfigMap(): ConfigByModule {
  return Object.fromEntries(
    modules.map((m) => [m.manifest.id, m.manifest.defaultConfig]),
  );
}

/**
 * Auto-rotate interval options. `null` disables rotation. Other values are
 * in milliseconds; the desktop will advance to the next registered module on
 * each tick when a non-null option is selected.
 */
const AUTO_ROTATE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Off" },
  { value: 10_000, label: "10 seconds" },
  { value: 30_000, label: "30 seconds" },
  { value: 60_000, label: "1 minute" },
  { value: 5 * 60_000, label: "5 minutes" },
];

/**
 * Debounce for the auto-send effect. Sub-second so a quick color drag or
 * keystroke storm collapses into a single emit while still feeling live.
 */
const AUTO_SEND_DEBOUNCE_MS = 200;

export default function DesktopHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("unknown");
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(
    modules[0].manifest.id,
  );
  const [configByModule, setConfigByModule] = useState<ConfigByModule>(
    buildDefaultConfigMap,
  );
  const [autoRotateMs, setAutoRotateMs] = useState<number | null>(null);
  /**
   * Mirror of `selectedId` in a ref so the socket handler (bound once on
   * mount) can read the latest value without re-binding on every change.
   */
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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

    /**
     * Hardware controller input (Pi-side volume knob + macropad). The
     * server fans this out to the user room; filter by deviceId so a
     * multi-hologram setup doesn't cross the streams. The existing
     * auto-send useEffect picks up `selectedId` / config changes and
     * pushes the new module to the renderer for free.
     *
     *   next / prev → cycle the active module
     *   select     → invoke the active module's `onPrimaryAction` if it
     *                exposes one (visualizer uses this to cycle styles)
     */
    /**
     * AI Assistant — desktop is the speaker. The server fans `ai:tts`
     * to the entire user room; we play it via the browser's Web Speech
     * API. Cancel any in-flight utterance first so back-to-back
     * responses don't pile up in the speech queue.
     */
    socket.on("ai:tts", (payload) => {
      if (typeof window === "undefined") return;
      const synth = window.speechSynthesis;
      if (!synth) return;
      try {
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(payload.text);
        utter.rate = 1;
        utter.pitch = 1;
        synth.speak(utter);
      } catch (err) {
        console.warn("[ai] speechSynthesis failed:", err);
      }
    });

    socket.on("controller:input", (payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.action === "select") {
        // Read latest state via the functional updater to avoid stale
        // closures over selectedId / configByModule.
        setConfigByModule((prevConfigs) => {
          const activeId = selectedIdRef.current;
          const mod = modules.find((m) => m.manifest.id === activeId);
          if (!mod || !mod.onPrimaryAction) return prevConfigs;
          const cur = prevConfigs[mod.manifest.id] ?? mod.manifest.defaultConfig;
          const next = mod.onPrimaryAction(cur);
          if (next === null || next === undefined) return prevConfigs;
          return { ...prevConfigs, [mod.manifest.id]: next };
        });
        return;
      }
      setSelectedId((prev) => {
        if (modules.length === 0) return prev;
        const idx = modules.findIndex((m) => m.manifest.id === prev);
        const delta = payload.action === "next" ? 1 : -1;
        const nextIdx = (idx + delta + modules.length) % modules.length;
        return modules[nextIdx].manifest.id;
      });
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("device:status");
      socket.off("command:ack");
      socket.off("ai:tts");
      socket.off("controller:input");
      socket.disconnect();
    };
  }, [socket, userId, deviceId]);

  const selected =
    modules.find((m) => m.manifest.id === selectedId) ?? modules[0];
  const SelectedControls = selected.Controls;
  const currentConfig =
    configByModule[selected.manifest.id] ?? selected.manifest.defaultConfig;

  /**
   * Stream API given to the active module's Controls. Modules use this to
   * push real-time payloads (e.g. audio waveform samples) directly to the
   * renderer, bypassing the debounced config channel. The moduleId is bound
   * to the currently selected module so an emit can never leak to another.
   */
  const stream = useMemo<ModuleStream>(() => {
    return {
      emit: (data) => {
        if (!connected) return;
        socket.emit("module:stream-to-device", {
          moduleId: selected.manifest.id,
          deviceId,
          data,
        });
      },
    };
  }, [connected, socket, selected.manifest.id, deviceId]);

  const handleControlsChange = useCallback(
    (next: unknown) => {
      setConfigByModule((prev) => ({
        ...prev,
        [selected.manifest.id]: next,
      }));
    },
    [selected.manifest.id],
  );

  /**
   * Auto-send: any time the selected module or its config changes, push the
   * latest payload to the renderer after a short debounce. Switching modules
   * causes an immediate (post-debounce) send so the renderer flips to the
   * newly-picked module as soon as the user clicks it.
   *
   * Connection status is in the deps so a freshly-connected desktop emits the
   * current state to the bridge right away rather than waiting for a change.
   */
  useEffect(() => {
    if (!connected) return;
    const timer = window.setTimeout(() => {
      socket.emit("module:send-to-device", {
        commandId: randomId(),
        deviceId,
        moduleId: selected.manifest.id,
        config: currentConfig,
      });
    }, AUTO_SEND_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [connected, socket, deviceId, selected.manifest.id, currentConfig]);

  /**
   * Auto-rotate: when an interval is selected, cycle through the registered
   * modules at that cadence. `selectedId` is in the deps so manual clicks
   * reset the timer - the user gets a full interval after picking a module
   * before the rotation continues.
   */
  useEffect(() => {
    if (!autoRotateMs || modules.length <= 1) return;
    const interval = window.setInterval(() => {
      setSelectedId((prev) => {
        const idx = modules.findIndex((m) => m.manifest.id === prev);
        const nextIdx = (idx + 1) % modules.length;
        return modules[nextIdx].manifest.id;
      });
    }, autoRotateMs);
    return () => window.clearInterval(interval);
  }, [autoRotateMs, selectedId]);

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
            Control your Raspberry Pi-powered holographic assistant. Changes
            apply to the hologram live.
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
              Select a module to display and configure.
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
                    className={`relative rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-cyan-400 text-zinc-950"
                        : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {m.manifest.name}
                    {active && autoRotateMs ? (
                      <motion.span
                        key={`${m.manifest.id}-${autoRotateMs}`}
                        aria-hidden
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: autoRotateMs / 1000,
                          ease: "linear",
                        }}
                        className="absolute right-1 bottom-1 left-1 h-0.5 origin-left rounded-full bg-zinc-950/60"
                      />
                    ) : null}
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-3 text-sm">
                <span className="w-32 text-zinc-400">Auto rotate</span>
                <select
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-white"
                  value={autoRotateMs ?? ""}
                  onChange={(event) =>
                    setAutoRotateMs(
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                >
                  {AUTO_ROTATE_OPTIONS.map((option) => (
                    <option
                      key={option.label}
                      value={option.value === null ? "" : option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {autoRotateMs ? (
                <p className="text-xs text-zinc-500">
                  Cycling through {modules.length} modules - click any module
                  to reset the timer.
                </p>
              ) : null}
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
              onChange={handleControlsChange}
              stream={stream}
            />
          </div>
        </motion.section>
      </motion.div>
    </main>
  );
}
