"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import {
  modules,
  type AnyCubismModule,
  type StreamSource,
} from "@cubism/modules";

type ActiveModule = {
  module: AnyCubismModule;
  config: unknown;
};

export default function RendererHomePage() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState<ActiveModule | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  /**
   * Ref-backed frame bus for the active module's real-time stream. We
   * deliberately do NOT store frames in React state: the visualizer (the only
   * stream consumer) arrives at ~60Hz, and a `setState` per frame would
   * re-render the entire renderer tree — including the framer-motion carousel
   * — 60 times a second, which stutters badly on the Pi. Instead we stash the
   * latest payload in a mutable ref and notify subscribers imperatively, so
   * the module's own canvas loop reads frames without any React churn.
   */
  const streamBusRef = useRef<{
    latest: unknown;
    listeners: Set<(data: unknown) => void>;
  }>({ latest: undefined, listeners: new Set() });
  /**
   * The active module id mirrored into a ref so the high-frequency
   * `module:stream` handler can filter without re-binding on every state
   * change.
   */
  const activeIdRef = useRef<string | null>(null);
  /**
   * Latest active module mirrored into a ref so the keydown handler (bound
   * once on mount) can apply a module's `onPrimaryAction` locally — letting
   * the center macropad key act instantly on the Pi even if the desktop
   * control panel isn't open to round-trip the change.
   */
  const activeRef = useRef<ActiveModule | null>(null);

  const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID ?? "pi-holo-001";
  const userId = process.env.NEXT_PUBLIC_USER_ID ?? "demo-user";

  /**
   * Stable handle passed to the active module's Renderer. Referentially
   * constant for the page's lifetime so subscribing modules don't re-bind on
   * every render. Reads/writes go through `streamBusRef`.
   */
  const streamSource = useMemo<StreamSource>(
    () => ({
      subscribe: (listener) => {
        streamBusRef.current.listeners.add(listener);
        return () => {
          streamBusRef.current.listeners.delete(listener);
        };
      },
      getLatest: () => streamBusRef.current.latest,
    }),
    [],
  );

  const scheduleCanvasResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      window.dispatchEvent(new Event("resize"));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    activeIdRef.current = active?.module.manifest.id ?? null;
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setConnected(true);

      socket.emit("client:register", {
        role: "renderer",
        deviceId,
        userId,
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

      setActive((prev) => {
        // Reset stream data when switching modules so a new module doesn't
        // briefly render with stale frames from the previous one.
        if (!prev || prev.module.manifest.id !== mod.manifest.id) {
          streamBusRef.current.latest = undefined;
        }
        return { module: mod, config: parsed.data };
      });

      socket.emit("device:heartbeat", {
        deviceId,
        currentModuleId: payload.moduleId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("module:stream", (payload) => {
      if (payload.moduleId !== activeIdRef.current) return;
      // Imperative fan-out: stash the latest frame and notify subscribers
      // directly. No setState here, so streaming frames never re-render the
      // React tree.
      const bus = streamBusRef.current;
      bus.latest = payload.data;
      for (const listener of bus.listeners) listener(payload.data);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("module:display");
      socket.off("module:stream");
      socket.disconnect();
    };
  }, [socket, deviceId, userId]);

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

  /**
   * Hardware controller input via the browser. The Pi has a 3-key macropad
   * + volume knob plugged in; all of those generate ordinary keyboard
   * events the moment the renderer window has focus, so we don't need a
   * separate sidecar process. We just translate the keys into the same
   * `controller:input` event the (now-optional) pi-controller would emit.
   *
   * The server fans this out to the desktop control panel's user room,
   * which updates `selectedId` and pushes the new module back to us via
   * `module:display`.
   */
  useEffect(() => {
    function classify(event: KeyboardEvent): "next" | "prev" | "select" | null {
      // Ignore modified shortcuts so Ctrl-L / Cmd-R etc. don't fight us.
      if (event.ctrlKey || event.metaKey || event.altKey) return null;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
        case "PageDown":
        case "AudioVolumeUp":
          return "next";
        case "ArrowLeft":
        case "ArrowDown":
        case "PageUp":
        case "AudioVolumeDown":
          return "prev";
        case " ":
        case "Spacebar":
        case "Enter":
          // Center macropad key may be mapped to Space or Enter depending
          // on the user's setup; accept both (and `Spacebar` for older
          // browsers) and re-emit as the generic "select" action so the
          // desktop can route to the active module's primary action.
          return "select";
        default:
          return null;
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      // Most browsers fire key-repeat events when a key is held; we treat
      // the macropad knob as discrete clicks so ignore the repeats. The
      // detents fire fresh keydowns each time.
      if (event.repeat) return;
      const action = classify(event);
      if (!action) return;
      event.preventDefault();

      // Apply the active module's primary action locally for instant
      // feedback (e.g. cycling the aquarium's art style). This makes the
      // center key work on the Pi standalone; we still emit below so the
      // desktop control panel — the config source of truth — toggles in
      // lockstep and stays in sync. Both compute the next config from the
      // same current value, so applying in both places is idempotent.
      if (action === "select") {
        const current = activeRef.current;
        const primary = current?.module.onPrimaryAction;
        if (current && primary) {
          const next = primary(current.config);
          if (next !== null && next !== undefined) {
            setActive({ module: current.module, config: next });
          }
        }
      }

      socket.emit("controller:input", {
        deviceId,
        action,
        timestamp: new Date().toISOString(),
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [socket, deviceId]);

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
    /*
     * `perspective` on the outer container gives the 3D rotateY animations
     * below an actual sense of depth - without it framer-motion's rotateY
     * just renders as a flat horizontal squash. `fixed inset-0` makes the
     * carousel slot fill the viewport regardless of any host body styles.
     */
    <div className="fixed inset-0 bg-black" style={{ perspective: "1500px" }}>
      {/*
       * AnimatePresence with the default `sync` mode lets the outgoing and
       * incoming module animate at the same time, which is what gives the
       * carousel "one rotating out while the next rotates in" effect.
       * `mode="wait"` would queue them and lose the overlap.
       */}
      <AnimatePresence>
        {ActiveRenderer && active ? (
          <motion.div
            key={active.module.manifest.id}
            initial={CAROUSEL.initial}
            animate={CAROUSEL.animate}
            exit={CAROUSEL.exit}
            transition={CAROUSEL.transition}
            onAnimationStart={scheduleCanvasResize}
            onUpdate={scheduleCanvasResize}
            onAnimationComplete={() => {
              // R3F/Drei Html measures Canvas size from DOM geometry. During
              // the carousel transform that geometry changes continuously, so
              // resize throughout the transition and once more at rest. This
              // prevents Canvas overlays from snapping from a stale entry
              // measurement to the final centered layout.
              window.dispatchEvent(new Event("resize"));
            }}
            className="absolute inset-0"
          >
            <ActiveRenderer config={active.config} streamSource={streamSource} />
          </motion.div>
        ) : (
          <motion.main
            key="empty"
            initial={CAROUSEL.initial}
            animate={CAROUSEL.animate}
            exit={CAROUSEL.exit}
            transition={CAROUSEL.transition}
            className="absolute inset-0 flex items-center justify-center bg-black text-white"
          >
            No active module
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Spinning-carousel module transition. New modules rotate in from the left;
 * outgoing modules rotate off to the right. The combination of rotateY,
 * translateX, and scale (paired with the wrapper's CSS perspective) sells
 * the depth - it reads as a 3D ring of slides rotating past the viewer.
 *
 * Tweak `duration` here to make the swing slower / snappier; everything
 * else (angles, offsets, scale) is symmetric so left-to-right reads cleanly.
 */
const CAROUSEL = {
  initial: { rotateY: -70, x: "-55vw", opacity: 0, scale: 0.7 },
  animate: { rotateY: 0, x: "0vw", opacity: 1, scale: 1 },
  exit: { rotateY: 70, x: "55vw", opacity: 0, scale: 0.7 },
  transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
} as const;
