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

  /**
   * AI Assistant lifecycle events. The Pi captures push-to-talk audio and
   * sends it to the server (see `ai:audio` on the client→server side); the
   * server orchestrates STT → LLM and fans the results back over these
   * events. All three events carry a `requestId` so the renderer can
   * correlate transcript/response/error pairs and ignore stale results
   * from a cancelled/superseded request.
   */
  "ai:state": (payload: {
    deviceId: string;
    userId: string;
    requestId: string;
    state: "processing" | "idle" | "error";
  }) => void;

  "ai:transcript": (payload: {
    deviceId: string;
    userId: string;
    requestId: string;
    text: string;
  }) => void;

  "ai:response": (payload: {
    deviceId: string;
    userId: string;
    requestId: string;
    text: string;
  }) => void;

  /**
   * Tells the desktop browser (which has speakers) to play a TTS rendering
   * of the response. Sent fanout to the entire user room; only the desktop
   * actually consumes this.
   *
   * When `audio` is present the desktop plays those bytes directly via an
   * HTMLAudioElement (typical case — server has synthesized speech with
   * Piper / OpenedAI / OpenAI TTS). When omitted the desktop falls back
   * to the browser's `window.speechSynthesis` API using `text` so a TTS
   * outage doesn't silently mute the assistant.
   */
  "ai:tts": (payload: {
    userId: string;
    requestId: string;
    text: string;
    audio?: ArrayBuffer | Uint8Array;
    mime?: string;
  }) => void;

  "ai:error": (payload: {
    deviceId: string;
    userId: string;
    requestId: string;
    message: string;
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

  /**
   * AI Assistant audio upload — push-to-talk recording from the Pi's USB
   * mic. The server runs this through a Whisper-compatible STT endpoint,
   * pipes the transcript into LM Studio, then emits `ai:transcript`,
   * `ai:response`, and `ai:tts` back to the user's room.
   *
   * `audio` is the raw encoded blob (default webm/opus from
   * MediaRecorder). Socket.IO transports binary natively, so the field
   * arrives as a Node Buffer on the server side.
   *
   * `config` carries per-conversation tunables resolved from the active
   * AI module's settings on the desktop. The server does not persist this
   * across requests; the desktop is the source of truth.
   */
  "ai:audio": (payload: {
    deviceId: string;
    userId: string;
    requestId: string;
    audio: ArrayBuffer | Uint8Array;
    mime: string;
    config: {
      lmStudioUrl: string;
      llmModel: string;
      whisperUrl: string;
      whisperModel: string;
      whisperLanguage: string;
      systemPrompt: string;
      maxTurns: number;
      ttsEnabled: boolean;
      ttsUrl: string;
      ttsVoice: string;
      ttsModel: string;
    };
  }) => void;

  /** Clear the server-side conversation history for this user. */
  "ai:reset": (payload: { userId: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  role?: ClientRole;
  deviceId?: string;
  userId?: string;
};
