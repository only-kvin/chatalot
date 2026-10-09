import type { MetadataRoute } from "next";
import { BRAND_URL } from "@/lib/brand";

// Keep crawlers on the marketing site: the app, the APIs and customers'
// personal booking/manage links (/b, /c) are never meant for search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api/", "/b/", "/c/", "/callback", "/welcome"],
    },
    sitemap: `${BRAND_URL}/sitemap.xml`,
  };
}
