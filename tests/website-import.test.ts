// Website import against the real Supabase project (like rls.test.ts), with
// a fake website and a fake embedder: no real crawling or Voyage calls.
// Covers robots.txt, staying on the site, skip paths, the page cap, not
// re-embedding unchanged pages, deleting pages gone twice, tenant isolation,
// allowed domains and excluded pages in search.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import type { FetchedPage } from "../lib/website/fetch-page";
import { ImportRefusedError, importWebsite, runWebsiteImport, type ImportDeps } from "../lib/website/import";
import { contentHash } from "../lib/website/chunk";
import { recordConsent } from "../lib/consent/business-consent";

// Each import writes ~50 pages to the remote database.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const admin = createAdminClient();
const suffix = Date.now();
const SITE = "https://shop-a.test";
const PASSWORD = "test-password-0123!";
const emailB = `test-website-b-${suffix}@example.com`;

let tenantA: { id: string };
let tenantB: { id: string };
let userB: string;

// The fake site: a home page linking to real pages, a robots-blocked page,
// a cart, another website, an almost-empty page and 70 more pages.
const words = (n: number, w: string) => Array.from({ length: n }, () => w).join(" ");
const gone = new Set<string>();
const fetched: string[] = [];

function sitePage(url: string): FetchedPage {
  const path = new URL(url).pathname;
  if (gone.has(path)) return { kind: "gone", url };
  if (path === "/") {
    return {
      kind: "page",
      url,
      title: "Shop A",
      text: `## Welcome\n\n${words(60, "welcome")}`,
      links: [
        `${SITE}/services`,
        `${SITE}/about`,
        `${SITE}/private/notes`,
        `${SITE}/cart`,
        "https://other.test/elsewhere",
        `${SITE}/empty`,
        ...Array.from({ length: 70 }, (_, i) => `${SITE}/p${i}`),
      ],
    };
  }
  if (path === "/empty") return { kind: "page", url, title: "Empty", text: "Loading…", links: [] };
  if (path === "/services") return { kind: "page", url, title: "Services", text: `Gel manicure R350. ${words(80, "nails")}`, links: [] };
  return { kind: "page", url, title: path, text: `${path} ${words(60, "text")}`, links: [] };
}

let embedCalls = 0;
function fakeVector(text: string): number[] {
  const hash = contentHash(text);
  return Array.from({ length: 1024 }, (_, i) => (parseInt(hash.slice(i % 60, (i % 60) + 4), 16) % 1000) / 1000 + 0.001);
}

const deps: ImportDeps = {
  fetchPage: async (url) => {
    fetched.push(url);
    return sitePage(url);
  },
  fetchRaw: async (url) =>
    url.endsWith("/robots.txt")
      ? { url, status: 200, contentType: "text/plain", body: "User-agent: *\nDisallow: /private" }
      : null, // no sitemap: links are followed
  embed: async (texts) => {
    embedCalls++;
    return texts.map(fakeVector);
  },
};

async function runImport(tenantId: string, url = SITE) {
  const id = await importWebsite(admin, tenantId, url);
  expect(await runWebsiteImport(admin, id, { deps })).toBe("done");
  const { data } = await admin.from("website_imports").select("*").eq("id", id).single();
  return data!;
}

async function websiteItems(tenantId: string) {
  const { data } = await admin.from("knowledge_items").select("id, source_url, gone_count, type, source").eq("tenant_id", tenantId).eq("source", "website");
  return data ?? [];
}

beforeAll(async () => {
  tenantA = await createTenant(admin, { name: "Website A", slug: `test-website-a-${suffix}` });
  tenantB = await createTenant(admin, { name: "Website B", slug: `test-website-b-${suffix}` });
  await admin.from("tenants").update({ allowed_domains: ["shop-a.test"] }).eq("id", tenantA.id);
  await admin.from("tenants").update({ allowed_domains: ["shop-b.test"] }).eq("id", tenantB.id);
  for (const t of [tenantA, tenantB]) {
    await recordConsent(admin, { tenantId: t.id, kind: "website_content", granted: true, source: "admin", grantedBy: null, note: "test" });
  }
  const { data, error } = await admin.auth.admin.createUser({ email: emailB, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userB = data.user.id;
  await admin.from("tenant_members").insert({ tenant_id: tenantB.id, user_id: userB, role: "owner" });
});

afterAll(async () => {
  for (const t of [tenantA, tenantB]) if (t) await admin.from("tenants").delete().eq("id", t.id);
  if (userB) await admin.auth.admin.deleteUser(userB);
});

describe("website import", () => {
  it("reads the site within the rules and files pages for that business only", async () => {
    const run = await runImport(tenantA.id);

    expect(fetched.length).toBeLessThanOrEqual(50);
    expect(fetched.every((u) => u.startsWith(`${SITE}/`))).toBe(true);
    expect(fetched).not.toContain(`${SITE}/private/notes`); // robots.txt
    expect(fetched).not.toContain(`${SITE}/cart`); // skip path
    expect(fetched.some((u) => u.includes("other.test"))).toBe(false);

    expect(run.status).toBe("done");
    expect(run.pages_empty).toBe(1);
    const items = await websiteItems(tenantA.id);
    expect(items.length).toBe(run.pages_done);
    expect(items.every((i) => i.type === "page")).toBe(true);
    expect(items.some((i) => i.source_url === `${SITE}/empty`)).toBe(false);

    // Chunks belong to tenant A, and tenant B got nothing.
    const { data: chunks } = await admin.from("knowledge_chunks").select("tenant_id").in("item_id", items.map((i) => i.id));
    expect(new Set(chunks?.map((c) => c.tenant_id))).toEqual(new Set([tenantA.id]));
    expect(await websiteItems(tenantB.id)).toEqual([]);
  });

  it("doesn't re-embed pages that haven't changed", async () => {
    embedCalls = 0;
    await runImport(tenantA.id);
    expect(embedCalls).toBe(0);
  });

  it("deletes a page that's gone on two crawls in a row", async () => {
    gone.add("/about");
    await runImport(tenantA.id);
    let about = (await websiteItems(tenantA.id)).find((i) => i.source_url === `${SITE}/about`);
    expect(about?.gone_count).toBe(1);
    await runImport(tenantA.id);
    about = (await websiteItems(tenantA.id)).find((i) => i.source_url === `${SITE}/about`);
    expect(about).toBeUndefined();
  });

  it("refuses websites outside the business's allowed domains", async () => {
    await expect(importWebsite(admin, tenantA.id, "https://other.test")).rejects.toThrow(ImportRefusedError);
    await expect(importWebsite(admin, tenantB.id, SITE)).rejects.toThrow(ImportRefusedError);
    await expect(importWebsite(admin, tenantA.id, "http://localhost:3000")).rejects.toThrow(ImportRefusedError);
  });

  it("allows only one import at a time per business", async () => {
    const first = await importWebsite(admin, tenantA.id, SITE);
    await expect(importWebsite(admin, tenantA.id, SITE)).rejects.toThrow(/already running/);
    await admin.from("website_imports").delete().eq("id", first);
  });

  it("never returns excluded pages from search", async () => {
    const items = await websiteItems(tenantA.id);
    const services = items.find((i) => i.source_url === `${SITE}/services`)!;
    const { data: chunk } = await admin.from("knowledge_chunks").select("embedding").eq("item_id", services.id).limit(1).single();
    const query = typeof chunk!.embedding === "string" ? JSON.parse(chunk!.embedding) : chunk!.embedding;

    const search = async () => {
      const { data, error } = await admin.rpc("match_chunks", { p_tenant_id: tenantA.id, p_query_embedding: query, p_k: 5 });
      if (error) throw error;
      return data as { item_id: string; source: string; source_url: string }[];
    };
    const before = await search();
    expect(before[0]).toMatchObject({ item_id: services.id, source: "website", source_url: `${SITE}/services` });

    // Excluded but with its chunks still there: the search itself must skip it.
    await admin.from("knowledge_items").update({ excluded: true }).eq("id", services.id);
    expect((await search()).some((m) => m.item_id === services.id)).toBe(false);
    await admin.from("knowledge_items").update({ excluded: false }).eq("id", services.id);
  });

  it("hides one business's website pages and imports from another's users", async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { error } = await client.auth.signInWithPassword({ email: emailB, password: PASSWORD });
    if (error) throw error;
    const { data: items } = await client.from("knowledge_items").select("id").eq("tenant_id", tenantA.id);
    const { data: imports } = await client.from("website_imports").select("id").eq("tenant_id", tenantA.id);
    expect(items).toEqual([]);
    expect(imports).toEqual([]);
  });
});
