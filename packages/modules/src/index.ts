import type { AnyCubismModule } from "./types";
import { clockModule } from "./clock";
import { textModule } from "./text";
import { weatherModule } from "./weather";
import { spotifyModule } from "./spotify";
import { visualizerModule } from "./visualizer";

/**
 * The single source of truth for all registered modules. Adding a new module
 * means creating a folder under `packages/modules/src/<id>/` and appending its
 * `defineModule(...)` export here. Both the desktop and renderer apps consume
 * this array - they do not need to know about specific modules.
 */
export const modules: readonly AnyCubismModule[] = [
  clockModule,
  textModule,
  weatherModule,
  spotifyModule,
  visualizerModule,
];

export * from "./types";
export * from "./defineModule";
export { randomId } from "./_lib/randomId";
// Per-module exports (clockModule, textModule, their config types, defaults)
// are intentionally NOT re-exported here to avoid collisions on shared symbol
// names like `DEFAULT_TEXT_COLOR`. Consumers should import the `modules`
// array; deep imports use `@cubism/modules/<id>` if explicitly opted into.
