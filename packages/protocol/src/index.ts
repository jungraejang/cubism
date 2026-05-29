export type ClientRole = "desktop" | "renderer" | "controller";

/**
 * Hardware controller actions.
 *  - `next` / `prev`: cycle the active module (volume knob, ←/→ keys).
 *  - `select`: trigger the active module's primary contextual action
 *    (center macropad key, Enter key). Each module decides what this
 *    means via `CubismModule.onPrimaryAction`; for the visualizer it
 *    cycles draw styles, others may ignore it.
 */
export type ControllerAction = "next" | "prev" | "select";

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

  /**
   * Hardware controller (e.g. Pi-side volume knob) input relayed to the
   * desktop control panel. The server fans this out to every socket in the
   * controller's user room.
   */
  "controller:input": (payload: {
    deviceId: string;
    action: ControllerAction;
    timestamp: string;
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

  /**
   * Controller-emitted hardware input. The server relays it to the
   * controller's user room as `controller:input` (server-to-client).
   */
  "controller:input": (payload: {
    deviceId: string;
    action: ControllerAction;
    timestamp: string;
  }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  role?: ClientRole;
  deviceId?: string;
  userId?: string;
};
