import type { ModuleId, ModuleConfigMap } from "@cubism/protocol";

export type ModulePermission =
  | "network"
  | "microphone"
  | "camera"
  | "supabase"
  | "comfyui"
  | "storage";

export type HologramModuleManifest<TModuleId extends ModuleId> = {
  id: TModuleId;
  name: string;
  description: string;
  version: string;
  defaultConfig: ModuleConfigMap[TModuleId];
  rendererComponentName: string;
  permissions: ModulePermission[];
};
