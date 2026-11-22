import type { NextConfig } from "next";
import { BUSINESS_GROUPS } from "./lib/marketing/business-types";

const nextConfig: NextConfig = {
  // Dev only: Cloudflare quick tunnels (testing PayFast or Meta webhooks
  // against `next dev`). Without this the dev server refuses the tunnel's
  // live-reload connection and the browser reloads the page every few
  // seconds, restarting any widget mid-booking.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // The per-type pages (/for/plumbers…) were merged into their group's page
  // (2026-10-10): each now lands on its own example there.
  async redirects() {
    return BUSINESS_GROUPS.flatMap((g) =>
      g.types.map((t) => ({ source: `/for/${t.slug}`, destination: `/for/${g.slug}#${t.slug}`, permanent: true })),
    );
  },
  experimental: {
    serverActions: {
      // Staff photo uploads (up to 2 MB, see app/(dashboard)/dashboard/staff/actions.ts)
      // plus multipart overhead. The default is 1 MB.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
