import { appUrl } from "@/lib/app-url";
import { extractPage } from "./extract";
import { safeFetch } from "./safe-fetch";

// Fetching one page and turning it into text, behind one interface so the
// crawler doesn't care how. The default is a plain (guarded) fetch. When
// FIRECRAWL_API_KEY is set, pages that come back nearly empty, usually
// because the site builds them with JavaScript, are retried through
// Firecrawl, which renders them first.

export const BOT_USER_AGENT = `ChatAlotBot/1.0 (+${appUrl("/bot")})`;

// Below this much text a page is treated as empty.
export const MIN_PAGE_CHARS = 200;

export type FetchedPage =
  | { kind: "page"; url: string; title: string; text: string; links: string[] }
  | { kind: "gone"; url: string } // 404 or 410
  | { kind: "skip"; url: string; reason: string } // not HTML, or redirected off the site
  | { kind: "error"; url: string; reason: string };

export type PageFetcher = (url: string) => Promise<FetchedPage>;

export const plainFetcher: PageFetcher = async (url) => {
  try {
    const res = await safeFetch(url, { userAgent: BOT_USER_AGENT });
    if (res.status === 404 || res.status === 410) return { kind: "gone", url };
    if (res.status >= 400) return { kind: "error", url, reason: `HTTP ${res.status}` };
    if (!/text\/html|application\/xhtml/i.test(res.contentType)) return { kind: "skip", url: res.url, reason: "not a web page" };
    const page = extractPage(res.body, res.url);
    return { kind: "page", url: res.url, ...page };
  } catch (err) {
    return { kind: "error", url, reason: err instanceof Error ? err.message : "fetch failed" };
  }
};

// Firecrawl renders a page and returns its main content as Markdown.
async function firecrawlText(url: string, apiKey: string): Promise<{ title: string; text: string } | null> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { markdown?: string; metadata?: { title?: string } } };
  const text = json.data?.markdown?.trim();
  return text ? { title: json.data?.metadata?.title ?? "", text } : null;
}

export function defaultFetcher(): PageFetcher {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return plainFetcher;
  return async (url) => {
    const page = await plainFetcher(url);
    if (page.kind !== "page" || page.text.length >= MIN_PAGE_CHARS) return page;
    const rendered = await firecrawlText(page.url, apiKey).catch(() => null);
    // Links still come from the plain HTML, which is enough to find pages.
    return rendered ? { ...page, title: rendered.title || page.title, text: rendered.text } : page;
  };
}
