import type { AnyCubismModule } from "./types";
import { clockModule } from "./clock";

/**
 * The single source of truth for all registered modules. Adding a new module
 * means creating a folder under `packages/modules/src/<id>/` and appending its
 * `defineModule(...)` export here. Both the desktop and renderer apps consume
 * this array - they do not need to know about specific modules.
 */
export const modules: readonly AnyCubismModule[] = [clockModule];

export * from "./types";
export * from "./defineModule";
export * from "./clock";
