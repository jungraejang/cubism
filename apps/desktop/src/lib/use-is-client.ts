import { useSyncExternalStore } from "react";

/**
 * True only in the browser after React has hydrated. During SSR (and
 * during the hydration pass itself) this returns false so the server
 * HTML matches the client's first paint.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
