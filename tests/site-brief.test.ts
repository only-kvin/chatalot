// Site briefs against the real Supabase project, with the model and the
// website fetch mocked (a fixed extraction). Covers consent gating,
// withdrawing consent, tenant isolation, the export API's auth, the stored
// schema version and a brief for a business with no website.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// The export API checks a session when no token is sent; there's no request
// here, so the session lookup is mocked (a signed-in non-admin by default).
const sessionUser = vi.fn(async () => ({ id: "00000000-0000-0000-0000-000000000000", email: "x@example.com" }) as { id: string; email: string } | null);
vi.mock("@/lib/db/auth", () => ({ getSessionUser: () => sessionUser() }));
vi.mock("@/lib/db/supabase-server", async () => {
  const { createAdminClient } = await import("../lib/db/supabase-admin");
  return { createClient: async () => createAdminClient() };
});

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const { createAdminClient } = await import("../lib/db/supabase-admin");
const { createTenant } = await import("../lib/db/create-tenant");
const { recordConsent, currentConsents } = await import("../lib/consent/business-consent");
const { generateSiteBrief } = await import("../lib/site-brief/generate");
const { withdrawWebsiteContent } = await import("../lib/site-brief/generate");
const { importWebsite, ImportRefusedError } = await import("../lib/website/import");
const { siteProfileSchema, PROFILE_SCHEMA_VERSION } = await import("../lib/site-brief/profile");
const { GET: listBriefs } = await import("../app/api/admin/site-briefs/route");
const { GET: getBrief } = await import("../app/api/admin/site-briefs/[id]/route");

const admin = createAdminClient();
const suffix = Date.now();
const PASSWORD = "test-password-0123!";
const emailA = `test-brief-a-${suffix}@example.com`;
const emailB = `test-brief-b-${suffix}@example.com`;
let tenantA: { id: string; public_widget_key: string };
let tenantB: { id: string };
let tenantC: { id: string }; // no website at all
const users: string[] = [];

const extractCalls: { businessName: string; ownerText: string; websiteText: string }[] = [];
const deps = {
  extract: async (input: { businessName: string; ownerText: string; websiteText: string }) => {
    extractCalls.push(input);
    return {
      owner: { address: "12 Main Road, Sea Point", phone: null, email: null, hoursSummary: null, prices: [] },
      website: {
        sameBusiness: true,
        tagline: input.websiteText ? "Nails, done beautifully" : null,
        about: input.websiteText ? "A nail studio in Sea Point." : null,
        address: null,
        phone: input.websiteText ? "021 555 0000" : null,
        email: null,
        copyTone: null,
        faqs: [],
        prices: input.websiteText ? [{ service: "Gel manicure", price: "R999" }] : [],
      },
    };
  },
  fetchHtml: async () => `<img src="/salon.jpg" width="800"><img src="/logo.png" alt="logo">`,
};

async function user(email: string, tenantId: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  await admin.from("tenant_members").insert({ tenant_id: tenantId, user_id: data.user.id, role: "owner" });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

beforeAll(async () => {
  tenantA = (await createTenant(admin, { name: "Brief Salon", slug: `test-brief-a-${suffix}` })) as typeof tenantA;
  tenantB = await createTenant(admin, { name: "Brief Other", slug: `test-brief-b-${suffix}` });
  tenantC = await createTenant(admin, { name: "Brief No Site", slug: `test-brief-c-${suffix}` });
  await admin.from("tenants").update({ plan: "starter", business_type: "beauty", allowed_domains: ["glow.test"] }).eq("id", tenantA.id);

  await admin.from("services").insert([
    { tenant_id: tenantA.id, name: "Gel manicure", duration_minutes: 45, price_cents: 35000 },
    { tenant_id: tenantA.id, name: "Pedicure", duration_minutes: 60, price_cents: null },
  ]);
  await admin.from("staff").insert({ tenant_id: tenantA.id, name: "Thandi", role: "Nail tech", avatar_url: "https://cdn.example/thandi.jpg" });
  await admin.from("knowledge_items").insert({ tenant_id: tenantA.id, type: "faq", title: "Walk-ins?", content: "When there's a gap." });
  // An imported website page and a finished import, as Phase 1 leaves them.
  await admin.from("knowledge_items").insert({
    tenant_id: tenantA.id,
    type: "page",
    source: "website",
    source_url: "https://glow.test/",
    title: "Home",
    content: "Glow: nails done beautifully. Gel manicure R999.",
  });
  await admin.from("website_imports").insert({ tenant_id: tenantA.id, start_url: "https://glow.test/", status: "done", finished_at: new Date().toISOString() });
  await admin.from("services").insert({ tenant_id: tenantC.id, name: "Consultation", duration_minutes: 30, price_cents: 50000 });
});

afterAll(async () => {
  for (const t of [tenantA, tenantB, tenantC]) if (t) await admin.from("tenants").delete().eq("id", t.id);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("without website consent", () => {
  it("refuses a website import", async () => {
    await expect(importWebsite(admin, tenantA.id, "https://glow.test")).rejects.toThrow(ImportRefusedError);
  });

  it("builds the brief from the owner's data only", async () => {
    extractCalls.length = 0;
    const { id } = await generateSiteBrief(admin, tenantA.id, { createdBy: null, deps });
    expect(extractCalls[0].websiteText).toBe("");
    const { data: brief } = await admin.from("site_briefs").select("*").eq("id", id).single();
    expect(brief.profile.website.url).toBeNull();
    expect(brief.profile.business.tagline).toBeNull();
    expect(brief.image_policy).toBe("ai_generated");
    expect(brief.prompt_markdown).not.toContain("R999");
  });
});

describe("with content consent but not image consent", () => {
  let briefId: string;
  beforeAll(async () => {
    await recordConsent(admin, { tenantId: tenantA.id, kind: "website_content", granted: true, source: "admin", grantedBy: null, note: "test" });
    await recordConsent(admin, { tenantId: tenantA.id, kind: "website_images", granted: false, source: "admin", grantedBy: null, note: "test" });
    briefId = (await generateSiteBrief(admin, tenantA.id, { createdBy: null, deps })).id;
  });

  it("uses website text, keeps the owner's prices and records the conflict", async () => {
    const { data: brief } = await admin.from("site_briefs").select("*").eq("id", briefId).single();
    expect(brief.profile.business.tagline).toBe("Nails, done beautifully");
    expect(brief.prompt_markdown).toContain("**Gel manicure** (R350, 45 min)");
    expect(brief.prompt_markdown).not.toContain("R999");
    expect(brief.conflicts).toContainEqual({ field: "price for Gel manicure", ownerValue: "R350", websiteValue: "R999" });
    expect(brief.missing).toContain("price for Pedicure");
  });

  it("has no site images or staff photos, and image_policy is ai_generated", async () => {
    const { data: brief } = await admin.from("site_briefs").select("*").eq("id", briefId).single();
    expect(brief.image_policy).toBe("ai_generated");
    expect(brief.profile.website.imageUrls).toEqual([]);
    expect(brief.profile.staff[0].photoUrl).toBeNull();
    expect(brief.prompt_markdown).not.toMatch(/salon\.jpg|logo\.png|thandi\.jpg/);
  });

  it("includes only the plan's widgets, with this business's key", async () => {
    const { data: brief } = await admin.from("site_briefs").select("prompt_markdown").eq("id", briefId).single();
    expect(brief!.prompt_markdown).toContain(`data-key="${tenantA.public_widget_key}"`);
    expect(brief!.prompt_markdown).toContain('data-chatalot="contact"');
    expect(brief!.prompt_markdown).not.toContain('data-chatalot="appointment"'); // starter plan
  });

  it("stores a profile that validates, with its schema version", async () => {
    const { data: brief } = await admin.from("site_briefs").select("profile, profile_schema_version, version").eq("id", briefId).single();
    expect(siteProfileSchema.safeParse(brief!.profile).success).toBe(true);
    expect(brief!.profile_schema_version).toBe(PROFILE_SCHEMA_VERSION);
    expect(brief!.version).toBe(2);
  });
});

describe("with image consent", () => {
  it("uses the site's images and staff photos", async () => {
    await recordConsent(admin, { tenantId: tenantA.id, kind: "website_images", granted: true, source: "admin", grantedBy: null, note: "test" });
    const { id } = await generateSiteBrief(admin, tenantA.id, { createdBy: null, deps });
    const { data: brief } = await admin.from("site_briefs").select("*").eq("id", id).single();
    expect(brief.image_policy).toBe("own");
    expect(brief.profile.website.imageUrls).toContain("https://glow.test/salon.jpg");
    expect(brief.profile.staff[0].photoUrl).toBe("https://cdn.example/thandi.jpg");
  });
});

describe("a business with no website", () => {
  it("still gets a complete brief from its ChatAlot data", async () => {
    const { id } = await generateSiteBrief(admin, tenantC.id, { createdBy: null, deps });
    const { data: brief } = await admin.from("site_briefs").select("*").eq("id", id).single();
    expect(siteProfileSchema.safeParse(brief.profile).success).toBe(true);
    expect(brief.prompt_markdown).toContain("**Consultation** (R500, 30 min)");
    expect(brief.profile.website.url).toBeNull();
  });
});

describe("access", () => {
  it("lets owners read only their own briefs", async () => {
    const clientB = await user(emailB, tenantB.id);
    const { data: seenByB } = await clientB.from("site_briefs").select("id").eq("tenant_id", tenantA.id);
    expect(seenByB).toEqual([]);
    const clientA = await user(emailA, tenantA.id);
    const { data: seenByA } = await clientA.from("site_briefs").select("id").eq("tenant_id", tenantA.id);
    expect(seenByA!.length).toBeGreaterThan(0);
  });

  it("refuses the export API to non-admins and bad tokens", async () => {
    process.env.SITE_BRIEFS_API_TOKEN = "t".repeat(40);
    const anyBrief = (await admin.from("site_briefs").select("id").eq("tenant_id", tenantA.id).limit(1).single()).data!.id;

    // Signed in, but not a platform admin.
    expect((await listBriefs(new Request("http://x/api/admin/site-briefs"))).status).toBe(401);
    sessionUser.mockResolvedValueOnce(null);
    expect((await getBrief(new Request(`http://x/api/admin/site-briefs/${anyBrief}`), { params: Promise.resolve({ id: anyBrief }) })).status).toBe(401);
    // A wrong token.
    const wrong = { headers: { authorization: `Bearer ${"x".repeat(40)}` } };
    expect((await listBriefs(new Request("http://x/api/admin/site-briefs", wrong))).status).toBe(401);
    // The right token.
    const right = { headers: { authorization: `Bearer ${"t".repeat(40)}` } };
    const ok = await listBriefs(new Request("http://x/api/admin/site-briefs?limit=200", right));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.exportVersion).toBe(1);
    expect(body.briefs.some((b: { tenant: { id: string } }) => b.tenant.id === tenantA.id)).toBe(true);
    const md = await getBrief(new Request(`http://x/api/admin/site-briefs/${anyBrief}?format=md`, right), { params: Promise.resolve({ id: anyBrief }) });
    expect(md.headers.get("content-type")).toContain("text/markdown");
  });
});

describe("withdrawing content consent", () => {
  it("removes website knowledge and withdraws the briefs", async () => {
    await withdrawWebsiteContent(admin, tenantA.id, { userId: null, source: "admin", note: "test" });
    const { count } = await admin.from("knowledge_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA.id).eq("source", "website");
    expect(count).toBe(0);
    const { data: briefs } = await admin.from("site_briefs").select("status").eq("tenant_id", tenantA.id);
    expect(briefs!.every((b) => b.status === "withdrawn")).toBe(true);
    expect((await currentConsents(admin, tenantA.id)).website_content?.granted).toBe(false);
  });
});
