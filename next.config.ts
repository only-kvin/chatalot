import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Staff photo uploads (up to 2 MB, see app/(dashboard)/dashboard/staff/actions.ts)
      // plus multipart overhead. The default is 1 MB.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
