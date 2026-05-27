import type { HologramModuleManifest } from "./types";

export const clockModule = {
  id: "clock",
  name: "Clock",
  description: "Displays a holographic animated clock.",
  version: "0.0.1",
  rendererComponentName: "ClockModule",
  permissions: [],
  defaultConfig: {
    format: "12h",
    showSeconds: true,
    timezone: undefined,
  },
} satisfies HologramModuleManifest<"clock">;
