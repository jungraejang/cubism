import { clockModule } from "./clock";

export const moduleRegistry = {
  clock: clockModule,
};

export type RegisteredModuleId = keyof typeof moduleRegistry;

export function getModule(moduleId: RegisteredModuleId) {
  return moduleRegistry[moduleId];
}

export * from "./types";
export * from "./clock";
