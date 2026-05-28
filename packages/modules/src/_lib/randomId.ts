/**
 * Returns a random identifier suitable for command IDs / OAuth state nonces.
 *
 * `crypto.randomUUID()` is only available in secure contexts (HTTPS or
 * localhost). When the desktop app is opened from a LAN IP over plain HTTP
 * the call throws, breaking auto-send and Spotify OAuth. This helper falls
 * back to a v4-style UUID built from `crypto.getRandomValues` (always
 * available) and finally to Math.random as a last-ditch option.
 */
export function randomId(): string {
  const g =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }) : {};
  const c = g.crypto;

  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // fall through to getRandomValues
    }
  }

  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    // RFC 4122 v4 layout
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  // Final fallback: not cryptographically strong, only used when crypto is
  // completely unavailable. Good enough for non-security command IDs.
  return `xxxxxxxxxxxxxxxxxxxx`.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}
