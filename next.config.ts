import type { NextConfig } from "next";
import { BUSINESS_GROUPS } from "./lib/marketing/business-types";

const nextConfig: NextConfig = {
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
