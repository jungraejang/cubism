import type { CubismModule } from "./types";

/**
 * Helper for declaring a module with full TConfig type inference.
 *
 * The single TConfig parameter is inferred from the Zod schema (or can be
 * supplied explicitly) and is then used to constrain `manifest.defaultConfig`,
 * `Controls`, and `Renderer` - so all four halves of a module are guaranteed
 * by the compiler to agree on the shape of the config.
 *
 * @example
 *   export const clockModule = defineModule({
 *     manifest: clockManifest,
 *     configSchema: ClockConfigSchema,
 *     Controls: ClockControls,
 *     Renderer: ClockRenderer,
 *   });
 */
export function defineModule<TConfig, TStream = unknown>(
  spec: CubismModule<TConfig, TStream>,
): CubismModule<TConfig, TStream> {
  return spec;
}
