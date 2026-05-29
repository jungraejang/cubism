import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ControllerAction,
  ServerToClientEvents,
} from "@cubism/protocol";

import { EV_KEY, watchEvdev, type EvdevWatcher } from "./evdev.js";
import { findDevicesByVidPid, type FoundDevice } from "./findDevice.js";

const VENDOR = process.env.CUBISM_CONTROLLER_VID ?? "1189";
const PRODUCT = process.env.CUBISM_CONTROLLER_PID ?? "8890";
const SERVER_URL = process.env.CUBISM_SERVER_URL ?? "http://127.0.0.1:3000";
const DEVICE_ID = process.env.CUBISM_DEVICE_ID ?? "pi-holo-001";
const USER_ID = process.env.CUBISM_USER_ID ?? "demo-user";
const DEBUG =
  process.env.CUBISM_CONTROLLER_DEBUG === "1" ||
  process.env.CUBISM_CONTROLLER_DEBUG === "true";

/**
 * Comma-separated list of `/dev/input/eventN` paths to watch directly,
 * bypassing VID:PID auto-discovery. Useful when the auto-picker can't
 * narrow down which interface carries the knob.
 */
const DEVICE_OVERRIDE = (process.env.CUBISM_CONTROLLER_DEVICES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Comma-separated `keyCode` values that should be treated as the
 * volume-up / volume-down equivalent. Lets the user remap when the knob
 * sends something exotic. Defaults: KEY_VOLUMEUP=115, KEY_VOLUMEDOWN=114.
 */
function parseKeyCodes(value: string | undefined, fallback: number[]): number[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}
const NEXT_KEYS = parseKeyCodes(process.env.CUBISM_CONTROLLER_NEXT_KEY, [115]);
const PREV_KEYS = parseKeyCodes(process.env.CUBISM_CONTROLLER_PREV_KEY, [114]);

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
          if (NEXT_KEYS.includes(event.code)) {
            emitAction(socket, "next");
          } else if (PREV_KEYS.includes(event.code)) {
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
  if (DEVICE_OVERRIDE.length > 0) {
    log(`using device override: ${DEVICE_OVERRIDE.join(", ")}`);
    return DEVICE_OVERRIDE.map((path) => ({ path, name: path }));
  }

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
  log(`startup: next=${NEXT_KEYS.join(",")} prev=${PREV_KEYS.join(",")} debug=${DEBUG}`);
  const socket = connectSocket();

  let shuttingDown = false;
  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down`);
    try {
      socket.close();
    } catch {
      // ignore
    }
    // Use _exit so any pending evdev streams or socket retries can't
    // delay the exit — systemd's TimeoutStopSec was firing before this
    // function returned in some configurations.
    setImmediate(() => process.exit(0));
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
