import type { ComponentType } from "react";
import type { ZodType } from "zod";

/**
 * Optional capabilities a module may declare it needs. Permissions are
 * informational at this stage - the host doesn't enforce them yet - but
 * documenting them in the manifest keeps the door open for a future
 * permission model.
 */
export type ModulePermission =
  | "network"
  | "microphone"
  | "camera"
  | "supabase"
  | "comfyui"
  | "storage";

export type ModuleManifest<TConfig> = {
  id: string;
  name: string;
  description: string;
  version: string;
  permissions: ModulePermission[];
  defaultConfig: TConfig;
};

/**
 * Lightweight pub/sub for low-latency streams that should NOT travel through
 * the per-keystroke config flow (e.g. audio waveform samples).
 *
 * The desktop's Controls calls `emit` repeatedly with module-specific data;
 * the renderer subscribes to a matching channel via its own RendererProps.
 * Payloads are typed `unknown` because each module defines its own shape.
 */
export type ModuleStream = {
  /** Push one frame of real-time data to the renderer. */
  emit: (data: unknown) => void;
};

/**
 * Props every module's desktop Controls component receives. The component is
 * fully controlled: it never owns state, just emits changes via `onChange`.
 * The hosting desktop app stores the config map and decides when to dispatch
 * it over the socket.
 *
 * `stream` is optional: modules that don't need real-time streaming can
 * ignore it. When present, modules can emit data to the renderer at a much
 * higher rate than config updates (no Zod validation, no debounce).
 */
export type ControlsProps<TConfig> = {
  config: TConfig;
  onChange: (next: TConfig) => void;
  stream?: ModuleStream;
};

/**
 * Props every module's Renderer component receives.
 *
 * `streamData` is the latest payload emitted via `ModuleStream.emit` from the
 * desktop, validated to be of type `TStream` (defaults to unknown). Modules
 * that don't use streaming can ignore this prop.
 */
export type RendererProps<TConfig, TStream = unknown> = {
  config: TConfig;
  streamData?: TStream;
};

/**
 * A complete module: manifest + Zod schema + Controls component (desktop) +
 * Renderer component (renderer device). The single TConfig type parameter
 * ties them together so they cannot drift apart.
 *
 * `onPrimaryAction` is an optional contextual action the host invokes when
 * the user triggers the "primary" / "select" gesture — currently mapped to
 * the Enter key (and to the macropad's center button on the Pi). Modules
 * use it to expose a one-shot toggle without consuming a UI slot: the
 * visualizer cycles through its draw styles, for example. Return the next
 * config to apply, or `null`/`undefined` if there's nothing to change.
 */
export type CubismModule<TConfig = unknown> = {
  manifest: ModuleManifest<TConfig>;
  configSchema: ZodType<TConfig>;
  Controls: ComponentType<ControlsProps<TConfig>>;
  Renderer: ComponentType<RendererProps<TConfig>>;
  onPrimaryAction?: (config: TConfig) => TConfig | null | undefined;
};

/**
 * Type-erased view of any registered module. Use this where the specific
 * config type can't be known statically (e.g. when iterating the registry).
 * The concrete TConfig is recovered at runtime via the module's Zod schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCubismModule = CubismModule<any>;
