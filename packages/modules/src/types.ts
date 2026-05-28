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
 * Props every module's desktop Controls component receives. The component is
 * fully controlled: it never owns state, just emits changes via `onChange`.
 * The hosting desktop app stores the config map and decides when to dispatch
 * it over the socket.
 */
export type ControlsProps<TConfig> = {
  config: TConfig;
  onChange: (next: TConfig) => void;
};

/**
 * A complete module: manifest + Zod schema + Controls component (desktop) +
 * Renderer component (renderer device). The single TConfig type parameter
 * ties them together so they cannot drift apart.
 */
export type CubismModule<TConfig = unknown> = {
  manifest: ModuleManifest<TConfig>;
  configSchema: ZodType<TConfig>;
  Controls: ComponentType<ControlsProps<TConfig>>;
  Renderer: ComponentType<{ config: TConfig }>;
};

/**
 * Type-erased view of any registered module. Use this where the specific
 * config type can't be known statically (e.g. when iterating the registry).
 * The concrete TConfig is recovered at runtime via the module's Zod schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCubismModule = CubismModule<any>;
