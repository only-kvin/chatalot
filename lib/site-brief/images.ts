import { parse } from "node-html-parser";
import { BOT_USER_AGENT } from "@/lib/website/fetch-page";
import { safeFetch } from "@/lib/website/safe-fetch";
import type { SiteImages } from "./build";

// The logo, photos and theme colour from a business's home page, read when a
// brief is made (the import keeps text only). Fetched through the same SSRF
// guard as the crawler. Called only with website_content consent; the
// builder drops the logo and photos unless website_images consent is given.

export type PageHtmlFetcher = (url: string) => Promise<string | null>;

export const fetchHomeHtml: PageHtmlFetcher = async (url) => {
  try {
    const res = await safeFetch(url, { userAgent: BOT_USER_AGENT });
    return res.status === 200 && /html/i.test(res.contentType) ? res.body : null;
  } catch {
    return null;
  }
};

const MAX_IMAGES = 12;

export function readSiteImages(html: string, pageUrl: string): SiteImages {
  const root = parse(html);
  const abs = (src: string | undefined | null) => {
    if (!src || src.startsWith("data:")) return null;
    try {
      const url = new URL(src, pageUrl);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  };

  // A logo: an <img> that says it's one, else the apple-touch icon.
  const logoImg = root
    .querySelectorAll("img")
    .find((img) => /logo/i.test(`${img.getAttribute("alt") ?? ""} ${img.getAttribute("class") ?? ""} ${img.getAttribute("src") ?? ""}`));
  const logoUrl = abs(logoImg?.getAttribute("src")) ?? abs(root.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"));

  const imageUrls = new Set<string>();
  const og = abs(root.querySelector('meta[property="og:image"]')?.getAttribute("content"));
  if (og) imageUrls.add(og);
  for (const img of root.querySelectorAll("img")) {
    if (imageUrls.size >= MAX_IMAGES) break;
    const src = abs(img.getAttribute("src"));
    // Skip the logo, icons and tracking pixels.
    if (!src || src === logoUrl || /\.svg($|\?)|icon|pixel|spacer/i.test(src)) continue;
    const w = Number(img.getAttribute("width") ?? 0);
    if (w && w < 120) continue;
    imageUrls.add(src);
  }

  const theme = root.querySelector('meta[name="theme-color"]')?.getAttribute("content")?.trim();
  return { logoUrl, imageUrls: [...imageUrls], themeColors: theme && /^#[0-9a-f]{3,8}$/i.test(theme) ? [theme] : [] };
}
