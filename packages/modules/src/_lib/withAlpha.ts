/**
 * Converts a #RRGGBB hex string into an rgba() string at the given alpha.
 * Used so user-chosen colors can flow through multiple layers (border, halo,
 * inner rings, text glow) at appropriate opacities.
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
