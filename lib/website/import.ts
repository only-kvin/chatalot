import type { SupabaseClient } from "@supabase/supabase-js";
import { embed as voyageEmbed } from "@/lib/agent/retrieval";
import { hasConsent } from "@/lib/consent/business-consent";
import { chunkPage, contentHash } from "./chunk";
import { BOT_USER_AGENT, defaultFetcher, MIN_PAGE_CHARS, type PageFetcher } from "./fetch-page";
import { ALLOW_ALL, parseRobots, robotsSitemaps, type RobotsRules } from "./robots";
import { safeFetch, type SafeResponse } from "./safe-fetch";
import { parseSitemap } from "./sitemap";
import { importableHosts, isCrawlable, MAX_DEPTH, MAX_PAGES, normalizeUrl, siteHosts } from "./urls";

// Importing a business's website into its knowledge base. importWebsite()
// records the run; runWebsiteImport() does the crawling, within a time
// budget, saving progress as it goes, so a run that's cut short is simply
// continued by the next trigger (the daily cron picks up stalled ones).
// Kept free of request and UI code so sign-up, admin tools and outreach
// demos can reuse it, and so a queue (Vercel Queues, Inngest) can call
// runWebsiteImport() later instead of waitUntil.

// Website text per business, so a big site can't swamp the knowledge base.
export const WEBSITE_CHAR_CAP = 300_000;
// Per page: anything longer is almost always a dump (a giant price list or
// archive), and the start of the page is what matters.
const PAGE_CHAR_CAP = 40_000;
const CONCURRENCY = 2;
// A runner that hasn't saved progress for this long is assumed dead.
const STALE_HEARTBEAT_MS = 60_000;

export type ImportDeps = {
  fetchPage: PageFetcher;
  // For robots.txt and sitemaps (not pages); null when unreachable.
  fetchRaw: (url: string, accept: string) => Promise<SafeResponse | null>;
  embed: (texts: string[], inputType: "query" | "document") => Promise<number[][]>;
};

export function defaultDeps(): ImportDeps {
  return {
    fetchPage: defaultFetcher(),
    fetchRaw: (url, accept) => safeFetch(url, { userAgent: BOT_USER_AGENT, accept }).catch(() => null),
    embed: voyageEmbed,
  };
}

export class ImportRefusedError extends Error {}

type QueueItem = { url: string; depth: number };

// Checks the start URL against the business's own domains and records a
// queued import. Throws ImportRefusedError with a message for the owner.
export async function importWebsite(admin: SupabaseClient, tenantId: string, startUrl: string): Promise<string> {
  // The business must have agreed to its website's content being used.
  if (!(await hasConsent(admin, tenantId, "website_content"))) {
    throw new ImportRefusedError("Agree to using your website's content first (Settings → Your website).");
  }
  const { data: tenant } = await admin.from("tenants").select("allowed_domains").eq("id", tenantId).single();
  const hosts = importableHosts(tenant?.allowed_domains ?? []);
  const withScheme = /^https?:\/\//i.test(startUrl.trim()) ? startUrl.trim() : `https://${startUrl.trim()}`;
  const url = normalizeUrl(withScheme);
  if (!url) throw new ImportRefusedError("That doesn't look like a web address.");
  if (!hosts.includes(new URL(url).hostname)) {
    throw new ImportRefusedError("Add this website under Settings → Allowed domains first.");
  }

  const { data, error } = await admin
    .from("website_imports")
    .insert({ tenant_id: tenantId, start_url: url, status: "queued" })
    .select("id")
    .single();
  if (error?.code === "23505") throw new ImportRefusedError("An import is already running for this business.");
  if (error) throw error;
  return data.id as string;
}

export type RunResult = "done" | "paused" | "failed" | "busy";

export async function runWebsiteImport(
  admin: SupabaseClient,
  importId: string,
  opts: { budgetMs?: number; deps?: ImportDeps } = {},
): Promise<RunResult> {
  const deps = opts.deps ?? defaultDeps();
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);

  // Take the run, unless another runner is actively working on it.
  const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const { data: run } = await admin
    .from("website_imports")
    .update({ status: "running", heartbeat_at: new Date().toISOString() })
    .eq("id", importId)
    .in("status", ["queued", "running"])
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${staleBefore}`)
    .select("*")
    .maybeSingle();
  if (!run) return "busy";
  const tenantId = run.tenant_id as string;

  const fail = async (message: string): Promise<RunResult> => {
    await admin
      .from("website_imports")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString(), heartbeat_at: null })
      .eq("id", importId)
      .eq("tenant_id", tenantId);
    return "failed";
  };

  try {
    const { data: tenant } = await admin.from("tenants").select("allowed_domains").eq("id", tenantId).single();
    const allowed = tenant?.allowed_domains ?? [];
    const startHost = new URL(run.start_url).hostname;
    // The domain may have been removed from Settings, or consent withdrawn,
    // since the import began.
    if (!importableHosts(allowed).includes(startHost)) return fail("This website is no longer in your allowed domains.");
    if (!(await hasConsent(admin, tenantId, "website_content"))) return fail("Consent to use the website's content was withdrawn.");
    const hosts = siteHosts(startHost, allowed);

    const robots = await loadRobots(run.start_url, deps);
    let queue = run.queue as QueueItem[];
    const seen = new Set<string>(run.seen as string[]);
    const counts = {
      pages_done: run.pages_done as number,
      pages_failed: run.pages_failed as number,
      pages_empty: run.pages_empty as number,
      capped: run.capped as boolean,
    };

    if (!run.started_at) {
      queue = await discover(run.start_url, hosts, robots, deps);
      await admin.from("website_imports").update({ started_at: new Date().toISOString() }).eq("id", importId).eq("tenant_id", tenantId);
    }

    const existing = await loadWebsiteItems(admin, tenantId);
    let totalChars = [...existing.values()].reduce((sum, item) => sum + item.length, 0);

    const save = (extra: Record<string, unknown> = {}) =>
      admin
        .from("website_imports")
        .update({
          ...counts,
          queue,
          seen: [...seen],
          pages_found: Math.min(MAX_PAGES, seen.size + queue.length),
          heartbeat_at: new Date().toISOString(),
          ...extra,
        })
        .eq("id", importId)
        .eq("tenant_id", tenantId);

    while (queue.length && seen.size < MAX_PAGES) {
      if (Date.now() > deadline) {
        await save();
        return "paused";
      }
      const batch = queue.splice(0, Math.min(CONCURRENCY, MAX_PAGES - seen.size));
      for (const item of batch) seen.add(item.url);

      const results = await Promise.all(batch.map((item) => deps.fetchPage(item.url).then((page) => ({ item, page }))));
      for (const { item, page } of results) {
        if (page.kind === "error") {
          counts.pages_failed++;
          continue;
        }
        if (page.kind === "skip") continue;
        if (page.kind === "gone") {
          await markGone(admin, tenantId, existing.get(item.url));
          continue;
        }

        // A redirect to another page of the site: file it under where it landed.
        const url = normalizeUrl(page.url) ?? item.url;
        if (!isCrawlable(url, hosts)) continue;
        if (url !== item.url) {
          if (seen.has(url)) continue;
          seen.add(url);
        }

        if (item.depth < MAX_DEPTH) {
          for (const link of page.links) {
            const next = normalizeUrl(link);
            if (!next || seen.has(next) || queue.some((q) => q.url === next)) continue;
            if (seen.size + queue.length >= MAX_PAGES) break;
            if (isCrawlable(next, hosts) && robots.isAllowed(next)) queue.push({ url: next, depth: item.depth + 1 });
          }
        }

        const text = page.text.length > PAGE_CHAR_CAP ? page.text.slice(0, PAGE_CHAR_CAP) : page.text;
        if (text.length < MIN_PAGE_CHARS) {
          counts.pages_empty++;
          continue;
        }
        const old = existing.get(url);
        if (totalChars - (old?.length ?? 0) + text.length > WEBSITE_CHAR_CAP) {
          counts.capped = true;
          continue;
        }
        try {
          await storePage(admin, tenantId, url, page.title || new URL(url).pathname, text, old, deps);
          totalChars += text.length - (old?.length ?? 0);
          existing.set(url, { id: old?.id ?? "", hash: contentHash(text), excluded: old?.excluded ?? false, goneCount: 0, length: text.length });
          counts.pages_done++;
        } catch (err) {
          console.error(`Storing ${url} for tenant ${tenantId} failed:`, err);
          counts.pages_failed++;
        }
      }
      await save();
    }

    await save({ status: "done", queue: [], finished_at: new Date().toISOString(), heartbeat_at: null });
    return "done";
  } catch (err) {
    console.error(`Website import ${importId} failed:`, err);
    return fail(err instanceof Error ? err.message : "The import failed.");
  }
}

async function loadRobots(startUrl: string, deps: ImportDeps): Promise<RobotsRules & { sitemaps: string[] }> {
  const robotsUrl = new URL("/robots.txt", startUrl).toString();
  const res = await deps.fetchRaw(robotsUrl, "text/plain");
  if (!res || res.status !== 200) return { ...ALLOW_ALL, sitemaps: [] };
  return { ...parseRobots(robotsUrl, res.body, BOT_USER_AGENT), sitemaps: robotsSitemaps(robotsUrl, res.body) };
}

// The pages to read: from the sitemap when the site has one (then no link
// following is needed), otherwise the start page, whose links lead on.
async function discover(
  startUrl: string,
  hosts: Set<string>,
  robots: RobotsRules & { sitemaps: string[] },
  deps: ImportDeps,
): Promise<QueueItem[]> {
  const pending = robots.sitemaps.length ? [...robots.sitemaps] : [new URL("/sitemap.xml", startUrl).toString()];
  const found: string[] = [];
  // A few sitemap files at most (an index can point at many).
  for (let fetched = 0; pending.length && fetched < 6 && found.length < MAX_PAGES * 2; fetched++) {
    const sitemapUrl = pending.shift()!;
    if (!isCrawlableSitemap(sitemapUrl, hosts)) continue;
    const res = await deps.fetchRaw(sitemapUrl, "application/xml,text/xml;q=0.9,*/*;q=0.5");
    if (!res || res.status !== 200) continue;
    const parsed = parseSitemap(res.body);
    pending.push(...parsed.sitemaps);
    found.push(...parsed.pages);
  }

  const start = normalizeUrl(startUrl)!;
  const pages = [start];
  for (const raw of found) {
    const url = normalizeUrl(raw);
    if (!url || pages.includes(url) || !isCrawlable(url, hosts) || !robots.isAllowed(url)) continue;
    pages.push(url);
    if (pages.length >= MAX_PAGES) break;
  }
  const fromSitemap = pages.length > 1;
  // Sitemap pages are read as listed (depth MAX_DEPTH: don't follow links).
  return pages
    .filter((url) => robots.isAllowed(url))
    .map((url, i) => ({ url, depth: fromSitemap && i > 0 ? MAX_DEPTH : 0 }));
}

function isCrawlableSitemap(url: string, hosts: Set<string>): boolean {
  try {
    return hosts.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

type ExistingItem = { id: string; hash: string | null; excluded: boolean; goneCount: number; length: number };

async function loadWebsiteItems(admin: SupabaseClient, tenantId: string): Promise<Map<string, ExistingItem>> {
  const { data, error } = await admin
    .from("knowledge_items")
    .select("id, source_url, content_hash, excluded, gone_count, content")
    .eq("tenant_id", tenantId)
    .eq("source", "website");
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.source_url as string,
      { id: r.id, hash: r.content_hash, excluded: r.excluded, goneCount: r.gone_count, length: (r.content as string).length },
    ]),
  );
}

// Saves a page and its chunks. Unchanged pages (same text hash) aren't
// re-embedded. Embedding happens before anything is written, so a failed
// embed leaves the old version intact and the page is retried next time.
export async function storePage(
  admin: SupabaseClient,
  tenantId: string,
  url: string,
  title: string,
  text: string,
  old: ExistingItem | undefined,
  deps: Pick<ImportDeps, "embed">,
): Promise<"unchanged" | "saved"> {
  const hash = contentHash(text);
  if (old && old.hash === hash) {
    if (old.goneCount > 0) await admin.from("knowledge_items").update({ gone_count: 0 }).eq("id", old.id).eq("tenant_id", tenantId);
    return "unchanged";
  }

  const chunks = old?.excluded ? [] : chunkPage(title, text);
  const embeddings = chunks.length ? await deps.embed(chunks, "document") : [];

  const fields = { title: title.slice(0, 200), content: text, content_hash: hash, gone_count: 0, updated_at: new Date().toISOString() };
  let itemId = old?.id;
  if (itemId) {
    const { error } = await admin.from("knowledge_items").update(fields).eq("id", itemId).eq("tenant_id", tenantId);
    if (error) throw error;
  } else {
    const { data, error } = await admin
      .from("knowledge_items")
      .insert({ tenant_id: tenantId, type: "page", source: "website", source_url: url, ...fields })
      .select("id")
      .single();
    if (error) throw error;
    itemId = data.id as string;
  }

  await admin.from("knowledge_chunks").delete().eq("item_id", itemId).eq("tenant_id", tenantId);
  if (chunks.length) {
    const { error } = await admin
      .from("knowledge_chunks")
      .insert(chunks.map((content, i) => ({ tenant_id: tenantId, item_id: itemId, content, embedding: embeddings[i] })));
    if (error) throw error;
  }
  return "saved";
}

// A page that's gone (404/410) on two crawls in a row is deleted, with its
// chunks (they cascade).
async function markGone(admin: SupabaseClient, tenantId: string, item: ExistingItem | undefined): Promise<void> {
  if (!item?.id) return;
  if (item.goneCount + 1 >= 2) {
    await admin.from("knowledge_items").delete().eq("id", item.id).eq("tenant_id", tenantId);
  } else {
    await admin.from("knowledge_items").update({ gone_count: item.goneCount + 1 }).eq("id", item.id).eq("tenant_id", tenantId);
  }
}

// Switching a page off removes it from search (its chunks go); switching it
// back on embeds it again.
export async function setPageExcluded(
  admin: SupabaseClient,
  tenantId: string,
  itemId: string,
  excluded: boolean,
  deps: Pick<ImportDeps, "embed"> = { embed: voyageEmbed },
): Promise<void> {
  const { data: item, error } = await admin
    .from("knowledge_items")
    .select("id, title, content")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .eq("source", "website")
    .single();
  if (error || !item) throw new ImportRefusedError("Page not found.");

  if (excluded) {
    await admin.from("knowledge_items").update({ excluded: true }).eq("id", itemId).eq("tenant_id", tenantId);
    await admin.from("knowledge_chunks").delete().eq("item_id", itemId).eq("tenant_id", tenantId);
    return;
  }
  const chunks = chunkPage(item.title, item.content);
  const embeddings = await deps.embed(chunks, "document");
  await admin.from("knowledge_chunks").delete().eq("item_id", itemId).eq("tenant_id", tenantId);
  const { error: insertError } = await admin
    .from("knowledge_chunks")
    .insert(chunks.map((content, i) => ({ tenant_id: tenantId, item_id: itemId, content, embedding: embeddings[i] })));
  if (insertError) throw insertError;
  await admin.from("knowledge_items").update({ excluded: false }).eq("id", itemId).eq("tenant_id", tenantId);
}

export async function removeWebsiteKnowledge(admin: SupabaseClient, tenantId: string): Promise<void> {
  const { error } = await admin.from("knowledge_items").delete().eq("tenant_id", tenantId).eq("source", "website");
  if (error) throw error;
}

// For the daily cron: continue imports whose runner stopped (time budget,
// deploy, crash) more than 15 minutes ago, then start the weekly re-crawl
// for a few businesses whose last import finished over 7 days ago.
export async function runScheduledImports(
  admin: SupabaseClient,
  opts: { budgetMs: number; maxRecrawls?: number; deps?: ImportDeps },
): Promise<{ resumed: number; recrawled: number }> {
  const deadline = Date.now() + opts.budgetMs;
  const remaining = () => deadline - Date.now();
  let resumed = 0;
  let recrawled = 0;

  const stale = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: stuck } = await admin
    .from("website_imports")
    .select("id")
    .in("status", ["queued", "running"])
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${stale}`)
    .lt("created_at", stale)
    .limit(5);
  for (const row of stuck ?? []) {
    if (remaining() < 20_000) break;
    await runWebsiteImport(admin, row.id, { budgetMs: remaining() - 10_000, deps: opts.deps });
    resumed++;
  }

  // The latest import per business; re-crawl the ones done more than a week ago.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: latest } = await admin
    .from("website_imports")
    .select("tenant_id, start_url, status, finished_at, created_at, tenants!inner(status)")
    .eq("tenants.status", "active")
    .order("created_at", { ascending: false })
    .limit(500);
  const newest = new Map<string, { start_url: string; status: string; finished_at: string | null }>();
  for (const row of latest ?? []) if (!newest.has(row.tenant_id)) newest.set(row.tenant_id, row);

  const due = [...newest.entries()].filter(([, r]) => r.status === "done" && r.finished_at && r.finished_at < weekAgo);
  for (const [tenantId, row] of due.slice(0, opts.maxRecrawls ?? 3)) {
    if (remaining() < 30_000) break;
    try {
      const id = await importWebsite(admin, tenantId, row.start_url);
      await runWebsiteImport(admin, id, { budgetMs: remaining() - 10_000, deps: opts.deps });
      recrawled++;
    } catch (err) {
      // Consent withdrawn or the domain removed: nothing to re-crawl.
      if (err instanceof ImportRefusedError) continue;
      console.error(`Weekly re-crawl for tenant ${tenantId} failed to start:`, err);
    }
  }
  return { resumed, recrawled };
}
