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
      // Event posters (up to 4 MB, app/(dashboard)/dashboard/events/actions.ts)
      // and staff photos (2 MB), plus multipart overhead. Vercel itself
      // accepts at most 4.5 MB. The default is 1 MB.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
