export type ClientRole = "desktop" | "renderer";

export type ModuleId = "clock";

export type DeviceStatus = "online" | "offline";

/**
 * Display rotation in degrees, applied as a CSS transform on the module
 * container. Used to compensate for beam-splitter optics that flip or rotate
 * the rendered image.
 */
export type ModuleRotation = 0 | 90 | 180 | 270;

export type ClockModuleConfig = {
  format: "12h" | "24h";
  showSeconds: boolean;
  timezone?: string;
  rotation?: ModuleRotation;
  /** Mirror the rendered output horizontally (scaleX(-1)). */
  flipHorizontal?: boolean;
  /** Mirror the rendered output vertically (scaleY(-1)). */
  flipVertical?: boolean;
};

export type ModuleConfigMap = {
  clock: ClockModuleConfig;
};

export type ServerToClientEvents = {
  "device:status": (payload: {
    deviceId: string;
    status: DeviceStatus;
    lastSeenAt: string;
  }) => void;

  "module:display": <TModuleId extends ModuleId>(payload: {
    commandId: string;
    moduleId: TModuleId;
    config: ModuleConfigMap[TModuleId];
  }) => void;

  "command:ack": (payload: {
    commandId: string;
    deviceId: string;
    status: "received" | "running" | "complete" | "error";
    error?: string;
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
    currentModuleId?: ModuleId;
    timestamp: string;
  }) => void;

  "module:send-to-device": <TModuleId extends ModuleId>(payload: {
    commandId: string;
    deviceId: string;
    moduleId: TModuleId;
    config: ModuleConfigMap[TModuleId];
  }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  role?: ClientRole;
  deviceId?: string;
  userId?: string;
};
