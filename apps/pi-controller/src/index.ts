import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ControllerAction,
  ServerToClientEvents,
} from "@cubism/protocol";

import {
  EV_KEY,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
  watchEvdev,
  type EvdevWatcher,
} from "./evdev.js";
import { findDevicesByVidPid, type FoundDevice } from "./findDevice.js";

const VENDOR = process.env.CUBISM_CONTROLLER_VID ?? "1189";
const PRODUCT = process.env.CUBISM_CONTROLLER_PID ?? "8890";
const SERVER_URL = process.env.CUBISM_SERVER_URL ?? "http://127.0.0.1:3000";
const DEVICE_ID = process.env.CUBISM_DEVICE_ID ?? "pi-holo-001";
const USER_ID = process.env.CUBISM_USER_ID ?? "demo-user";
const DEBUG =
  process.env.CUBISM_CONTROLLER_DEBUG === "1" ||
  process.env.CUBISM_CONTROLLER_DEBUG === "true";

const RESCAN_INITIAL_MS = 1_000;
const RESCAN_MAX_MS = 15_000;

type ControllerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function log(...args: unknown[]) {
  console.log("[pi-controller]", ...args);
}

function connectSocket(): ControllerSocket {
  log(`connecting to ${SERVER_URL}`);
  const socket: ControllerSocket = io(SERVER_URL, {
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    log(`connected as ${socket.id}; registering`);
    socket.emit("client:register", {
      role: "controller",
      userId: USER_ID,
      deviceId: DEVICE_ID,
    });
  });

  socket.on("disconnect", (reason) => {
    log(`disconnected: ${reason}`);
  });

  socket.on("connect_error", (err) => {
    log(`connect_error: ${err.message}`);
  });

  return socket;
}

function emitAction(socket: ControllerSocket, action: ControllerAction) {
  if (!socket.connected) {
    log(`drop ${action}: socket not connected`);
    return;
  }
  socket.emit("controller:input", {
    deviceId: DEVICE_ID,
    action,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Open every matching HID interface and stream keypresses through the
 * socket. Composite keyboards expose multiple event nodes and the knob can
 * be on any of them, so we watch them all in parallel rather than guess.
 * Returns when **all** watched streams close (e.g. the dongle was unplugged)
 * so the outer loop can re-discover it.
 */
async function streamDevices(
  devices: FoundDevice[],
  socket: ControllerSocket,
): Promise<void> {
  log(
    `watching ${devices.length} interface(s): ${devices.map((d) => d.path).join(", ")}`,
  );

  return new Promise((resolve) => {
    const watchers: EvdevWatcher[] = [];
    let openCount = devices.length;
    let settled = false;

    function settle() {
      if (settled) return;
      settled = true;
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // ignore
        }
      }
      resolve();
    }

    for (const device of devices) {
      const watcher = watchEvdev(
        device.path,
        (event) => {
          if (DEBUG && event.type !== 0 /* EV_SYN */) {
            log(
              `[${device.path}] type=${event.type} code=${event.code} value=${event.value}`,
            );
          }
          if (event.type !== EV_KEY) return;
          // Only key-down. Key-up (value=0) and auto-repeat (value=2)
          // would spam multiple emits per detent.
          if (event.value !== 1) return;
          if (event.code === KEY_VOLUMEUP) {
            emitAction(socket, "next");
          } else if (event.code === KEY_VOLUMEDOWN) {
            emitAction(socket, "prev");
          }
        },
        (reason, err) => {
          log(
            `evdev stream closed: ${device.path} (${reason})${err ? `: ${err.message}` : ""}`,
          );
          openCount -= 1;
          if (openCount <= 0) settle();
        },
      );
      watchers.push(watcher);
    }
  });
}

async function discoverDevices(): Promise<FoundDevice[]> {
  let delay = RESCAN_INITIAL_MS;
  while (true) {
    const devices = await findDevicesByVidPid(VENDOR, PRODUCT);
    if (devices.length > 0) return devices;

    log(
      `no device with VID:PID ${VENDOR}:${PRODUCT} found; retrying in ${delay}ms`,
    );
    await sleep(delay);
    delay = Math.min(delay * 2, RESCAN_MAX_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const socket = connectSocket();

  let shuttingDown = false;
  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down`);
    socket.close();
    process.exit(0);
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Outer loop: re-discover the device whenever we lose the stream
  // (kernel close, dongle unplug, USB reset, etc.).
  while (!shuttingDown) {
    const devices = await discoverDevices();
    await streamDevices(devices, socket);
    if (shuttingDown) break;
    log("all device streams ended, rescanning");
    await sleep(RESCAN_INITIAL_MS);
  }
}

main().catch((err) => {
  console.error("[pi-controller] fatal:", err);
  process.exit(1);
});
