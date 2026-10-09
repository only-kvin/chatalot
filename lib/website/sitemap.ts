// Reads <loc> entries from a sitemap or sitemap index. Sitemaps are simple
// enough that matching <loc> tags is reliable, and it avoids an XML parser.

export type ParsedSitemap = { pages: string[]; sitemaps: string[] };

export function parseSitemap(xml: string): ParsedSitemap {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));
  // A sitemap index lists other sitemaps; a plain sitemap lists pages.
  return /<sitemapindex[\s>]/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
