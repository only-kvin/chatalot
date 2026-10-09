import type { MetadataRoute } from "next";
import { BRAND_URL } from "@/lib/brand";
import { publicPaths } from "@/lib/marketing/paths";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths().map((path) => ({
    url: `${BRAND_URL}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.split("/").length === 2 ? 0.8 : 0.6,
  }));
}
