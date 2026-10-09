// Self-serve sign-up against the real Supabase project (no mocking), like
// rls.test.ts: a confirmed sign-up creates exactly one pending trial business
// and owner, repeating is harmless, one trial per email, RLS still isolates
// the new business, the owner can't approve themselves, and nothing about a
// pending business is served to the public.
// Run with: pnpm test

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { checkSignup, completeSignup, saveSignup } from "../lib/signup";
import { currentConsents } from "../lib/consent/business-consent";
import { resolvePublicTenant } from "../lib/widgets/public-request";

const PASSWORD = "test-password-0123!";
const admin = createAdminClient();
const suffix = Date.now();
const email = `test-signup-${suffix}@example.com`;
const tradesEmail = `test-signup-trades-${suffix}@example.com`;

let userId: string;
let tradesUserId: string;
let tenantId: string;
let tradesTenantId: string;
let other: { id: string };
let client: SupabaseClient;

async function createUser(address: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

beforeAll(async () => {
  other = await createTenant(admin, { name: "Signup Other", slug: `test-signup-other-${suffix}` });
  userId = await createUser(email);
  tradesUserId = await createUser(tradesEmail);
  await saveSignup(
    admin,
    { email, businessName: "Test Signup Salon", businessType: "beauty", terms: "on", consentWebsiteContent: true, consentWebsiteImages: false },
    false,
  );
  await saveSignup(
    admin,
    { email: tradesEmail, businessName: "Test Signup Plumbing", businessType: "trades", terms: "on", consentWebsiteContent: false, consentWebsiteImages: false },
    false,
  );

  client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("signups").delete().in("email", [email, tradesEmail]);
  for (const id of [tenantId, tradesTenantId, other?.id].filter(Boolean)) await admin.from("tenants").delete().eq("id", id);
  for (const id of [userId, tradesUserId].filter(Boolean)) await admin.auth.admin.deleteUser(id);
});

describe("self-serve sign-up", () => {
  it("creates exactly one pending trial business with the user as owner", async () => {
    const result = await completeSignup(admin, userId, email);
    expect(result).toMatchObject({ ok: true, created: true });
    if (!result.ok) return;
    tenantId = result.tenantId;

    const { data: tenant } = await admin.from("tenants").select("name, status, plan, business_type").eq("id", tenantId).single();
    expect(tenant).toEqual({ name: "Test Signup Salon", status: "pending", plan: "trial", business_type: "beauty" });

    const { data: members } = await admin.from("tenant_members").select("tenant_id, role").eq("user_id", userId);
    expect(members).toEqual([{ tenant_id: tenantId, role: "owner" }]);

    const [{ count: configs }, { count: widgets }] = await Promise.all([
      admin.from("agent_configs").select("tenant_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      admin.from("widget_settings").select("tenant_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);
    expect([configs, widgets]).toEqual([1, 1]);
  });

  it("records the sign-up form's website answers as the first consents", async () => {
    const consents = await currentConsents(admin, tenantId);
    expect(consents.website_content).toMatchObject({ granted: true, source: "signup" });
    expect(consents.website_images).toMatchObject({ granted: false, source: "signup" });
  });

  it("returns the same business when the link is used again", async () => {
    const again = await completeSignup(admin, userId, email);
    expect(again).toEqual({ ok: true, tenantId, created: false });
    const { count } = await admin.from("tenant_members").select("tenant_id", { count: "exact", head: true }).eq("user_id", userId);
    expect(count).toBe(1);
  });

  it("refuses a second sign-up with the same email", async () => {
    expect(await checkSignup(admin, email)).toEqual({ ok: false, reason: "used" });
    // And the database itself won't hold two sign-ups for one address.
    const { error } = await admin.from("signups").insert({ email, business_name: "Again", business_type: "beauty" });
    expect(error?.code).toBe("23505");
  });

  it("refuses a user who already belongs to another business", async () => {
    await admin.from("tenant_members").insert({ tenant_id: other.id, user_id: tradesUserId, role: "staff" });
    expect(await completeSignup(admin, tradesUserId, tradesEmail)).toEqual({ ok: false, reason: "member" });
    await admin.from("tenant_members").delete().eq("tenant_id", other.id).eq("user_id", tradesUserId);
  });

  it("starts trades with bookings hidden", async () => {
    const result = await completeSignup(admin, tradesUserId, tradesEmail);
    expect(result).toMatchObject({ ok: true, created: true });
    if (!result.ok) return;
    tradesTenantId = result.tenantId;
    const { data } = await admin.from("tenants").select("feature_overrides").eq("id", tradesTenantId).single();
    expect(data?.feature_overrides).toEqual({ bookings: "off" });
  });
});

describe("a signed-up owner", () => {
  it("sees their own business and not anyone else's", async () => {
    const { data } = await client.from("tenants").select("id").in("id", [tenantId, other.id]);
    expect(data?.map((t) => t.id)).toEqual([tenantId]);
  });

  it("can't read sign-ups", async () => {
    const { data } = await client.from("signups").select("email");
    expect(data ?? []).toEqual([]);
  });

  it("can't approve their own business", async () => {
    await client.from("tenants").update({ status: "active" }).eq("id", tenantId);
    const { data } = await admin.from("tenants").select("status").eq("id", tenantId).single();
    expect(data?.status).toBe("pending");
  });

  it("can't call complete_signup directly", async () => {
    const { error } = await client.rpc("complete_signup", { p_user_id: userId, p_email: email });
    expect(error).not.toBeNull();
  });
});

describe("a pending business in public", () => {
  async function keyFor(id: string) {
    const { data } = await admin.from("tenants").select("public_widget_key").eq("id", id).single();
    return data!.public_widget_key as string;
  }

  it("is not served to other websites", async () => {
    const request = new Request("https://chatalot.vercel.app/api/widget/config", { headers: { origin: "https://example.com" } });
    const result = await resolvePublicTenant(request, await keyFor(tenantId), "web_chat");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  it("still loads in its own dashboard preview", async () => {
    const request = new Request("https://chatalot.vercel.app/api/widget/config", { headers: { "sec-fetch-site": "same-origin" } });
    const result = await resolvePublicTenant(request, await keyFor(tenantId), "web_chat");
    expect(result).not.toBeInstanceOf(Response);
  });

  it("is refused once declined, even in the preview", async () => {
    await admin.from("tenants").update({ status: "declined" }).eq("id", tradesTenantId);
    const request = new Request("https://chatalot.vercel.app/api/widget/config", { headers: { "sec-fetch-site": "same-origin" } });
    const result = await resolvePublicTenant(request, await keyFor(tradesTenantId), "web_chat");
    expect((result as Response).status).toBe(404);
  });
});
