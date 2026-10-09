import type { MetadataRoute } from "next";
import { BRAND_URL } from "@/lib/brand";

// Public pages only. Add each marketing page here as it's built.
const PATHS = ["/", "/demo", "/login", "/terms", "/privacy", "/data-deletion"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: `${BRAND_URL}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
