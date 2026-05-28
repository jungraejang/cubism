export type ClientRole = "desktop" | "renderer";

export type DeviceStatus = "online" | "offline";

/**
 * Wire-level Socket.IO event signatures. The protocol package intentionally
 * knows nothing about specific modules: module IDs are opaque strings and
 * module configs are opaque `unknown` payloads. The receiving side looks up
 * the module in `@cubism/modules` and validates the config against that
 * module's Zod schema before trusting the data.
 */
export type ServerToClientEvents = {
  "device:status": (payload: {
    deviceId: string;
    status: DeviceStatus;
    lastSeenAt: string;
  }) => void;

  "module:display": (payload: {
    commandId: string;
    moduleId: string;
    config: unknown;
  }) => void;

  "command:ack": (payload: {
    commandId: string;
    deviceId: string;
    status: "received" | "running" | "complete" | "error";
    error?: string;
  }) => void;

  /**
   * High-frequency real-time stream from the desktop to a renderer device.
   * Used by modules that need to push live data (e.g. audio waveforms) faster
   * than the config channel. No commandId, no ack — fire and forget.
   */
  "module:stream": (payload: {
    moduleId: string;
    deviceId: string;
    data: unknown;
  }) => void;
};

export type ClientToServerEvents = {
  "client:register": (payload: {
    role: ClientRole;
    deviceId?: string;
    userId?: string;
  }) => void;

  "device:heartbeat": (payload: {
    deviceId: string;
    currentModuleId?: string;
    timestamp: string;
  }) => void;

  "module:send-to-device": (payload: {
    commandId: string;
    deviceId: string;
    moduleId: string;
    config: unknown;
  }) => void;

  /**
   * Desktop-emitted version of `module:stream`. Server simply relays it to
   * the device room — no validation, no ack.
   */
  "module:stream-to-device": (payload: {
    moduleId: string;
    deviceId: string;
    data: unknown;
  }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  role?: ClientRole;
  deviceId?: string;
  userId?: string;
};
