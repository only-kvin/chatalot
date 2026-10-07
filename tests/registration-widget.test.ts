// Registration and the customer's own page, end to end against the real dev
// Supabase project on a throwaway business — needs .env.local populated.
// Emails are mocked; nothing is sent. Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const background: Promise<unknown>[] = [];
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => background.push(p) }));
const settle = () => Promise.all(background.splice(0));
const linkEmails = vi.fn();
vi.mock("../lib/email/customer-page", async (orig) => ({
  ...(await orig<typeof import("../lib/email/customer-page")>()),
  emailCustomerPageLink: (...a: unknown[]) => linkEmails(...a),
}));
// Server actions call revalidatePath, which needs a Next.js request.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../lib/security/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../lib/security/rate-limit")>()),
  checkWidgetBookingLimit: async () => true,
}));

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { POST as registerRoute } from "../app/api/public/register/route";
import { loadCustomerPage } from "../lib/contacts/customer-page";
import { setConsentAction } from "../app/c/[token]/actions";
import { createCustomerToken } from "../lib/security/signed-token";

describe("registration widget", { timeout: 30_000 }, () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  const FUTURE = new Date(Date.now() + 86_400_000 * 30);
  let tenantId: string;
  let publicKey: string;
  let serviceId: string;

  const register = (answers: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    registerRoute(
      new Request("http://localhost/api/public/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: publicKey, answers, notifications: true, website: "", elapsedMs: 9_000, ...extra }),
      }),
    );
  const contactsByPhone = async (e164: string) =>
    (await admin.from("contacts").select("id, email, registered_at, marketing_opt_in_at").eq("tenant_id", tenantId).eq("phone_e164", e164)).data ?? [];

  beforeAll(async () => {
    const tenant = await createTenant(admin, { name: "Test Registration", slug: `test-registration-${suffix}` });
    tenantId = tenant.id;
    publicKey = tenant.public_widget_key;
    const { data } = await admin.from("services").insert({ tenant_id: tenantId, name: "Cut", duration_minutes: 30 }).select("id").single();
    serviceId = data!.id;
  });

  afterAll(async () => {
    await admin.from("bookings").delete().eq("tenant_id", tenantId);
    await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("signs someone up, records their consents and emails the link", async () => {
    const res = await register({ full_name: "Reg One", email: "reg.one@example.com", phone: "083 000 0091" }, { marketing: true });
    expect(await res.json()).toEqual({ ok: true });
    await settle();
    const [contact] = await contactsByPhone("27830000091");
    expect(contact.registered_at).toBeTruthy();
    expect(contact.marketing_opt_in_at).toBeTruthy();
    const { data: consents } = await admin.from("consents").select("kind, granted, source").eq("contact_id", contact.id);
    expect(consents).toEqual(
      expect.arrayContaining([
        { kind: "booking_notifications", granted: true, source: "registration_widget" },
        { kind: "marketing", granted: true, source: "registration_widget" },
      ]),
    );
    expect(linkEmails).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId, email: "reg.one@example.com" }));
  });

  it("answers the same for a returning customer, without duplicating or un-ticking anything", async () => {
    const first = (await contactsByPhone("27830000091"))[0];
    const again = await register({ full_name: "Reg One", email: "reg.one@example.com", phone: "083 000 0091" });
    expect(await again.json()).toEqual({ ok: true });
    const after = await contactsByPhone("27830000091");
    expect(after).toHaveLength(1);
    expect(after[0].registered_at).toBe(first.registered_at);
    // Not ticking marketing this time withdrew nothing.
    expect(after[0].marketing_opt_in_at).toBe(first.marketing_opt_in_at);
  });

  it("requires the booking-notifications consent", async () => {
    const res = await register({ full_name: "No Consent", email: "nc@example.com" }, { notifications: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/booking notifications/);
  });

  it("shows only bookings made with that exact email address", async () => {
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    await admin.from("bookings").insert([
      { tenant_id: tenantId, service_id: serviceId, name: "Mine", phone: "0830000091", email: "a_b@example.com", starts_at: at(48), ends_at: at(48.5) },
      // "_" would match any character in a plain LIKE.
      { tenant_id: tenantId, service_id: serviceId, name: "Not mine", phone: "0830000091", email: "axb@example.com", starts_at: at(72), ends_at: at(72.5) },
    ]);
    const page = await loadCustomerPage(createCustomerToken(tenantId, "a_b@example.com", FUTURE));
    expect(page?.upcoming.map((b) => b.serviceName)).toEqual(["Cut"]);
    expect(page?.upcoming[0].manageUrl).toMatch(/\/b\//);

    // Someone signing up with another person's phone and their own email
    // sees only what was booked with their own email.
    await register({ full_name: "Intruder", email: "intruder@example.com", phone: "083 000 0091" });
    const intruder = await loadCustomerPage(createCustomerToken(tenantId, "intruder@example.com", FUTURE));
    expect(intruder?.upcoming).toEqual([]);
  });

  it("lets customers switch marketing off on their page, recorded in the history", async () => {
    const token = createCustomerToken(tenantId, "reg.one@example.com", FUTURE);
    expect((await loadCustomerPage(token))?.consents.marketing).toBe(true);
    expect(await setConsentAction(token, "marketing", false)).toEqual({ error: null });
    const page = await loadCustomerPage(token);
    expect(page?.consents.marketing).toBe(false);
    const [contact] = await contactsByPhone("27830000091");
    expect(contact.marketing_opt_in_at).toBeNull();
    const { data: latest } = await admin.from("consents").select("granted, source").eq("contact_id", contact.id).eq("kind", "marketing").order("created_at", { ascending: false }).limit(1).single();
    expect(latest).toEqual({ granted: false, source: "customer_page" });

    expect((await setConsentAction(`${token}x`, "marketing", true)).error).toMatch(/expired/);
    expect(await loadCustomerPage("not-a-token")).toBeNull();
  });
});
