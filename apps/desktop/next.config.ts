import type { NextConfig } from "next";

/**
 * Comma-separated list of additional origins the Next.js dev server should
 * accept requests from. Next.js 15+ blocks non-localhost dev requests by
 * default (e.g. opening http://192.168.x.x:3000 from another LAN device),
 * which results in a black/blank screen because HMR resources fail to load.
 *
 * Set NEXT_PUBLIC_ALLOWED_DEV_ORIGINS in apps/desktop/.env.local, e.g.:
 *   NEXT_PUBLIC_ALLOWED_DEV_ORIGINS=192.168.0.108,192.168.0.0/24
 */
const extraDevOrigins = (process.env.NEXT_PUBLIC_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  transpilePackages: ["@cubism/modules"],
  allowedDevOrigins: ["localhost", "127.0.0.1", ...extraDevOrigins],
};

export default nextConfig;
