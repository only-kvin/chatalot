// The contact widget, end to end against the real dev Supabase project on a
// throwaway business — needs .env.local populated. Emails are mocked;
// nothing is sent. Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const background: Promise<unknown>[] = [];
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => background.push(p) }));
const settle = () => Promise.all(background.splice(0));
const ownerAlerts = vi.fn();
vi.mock("../lib/email/notify-contact-message", () => ({ notifyOwnerOfContactMessage: (...a: unknown[]) => ownerAlerts(...a) }));
vi.mock("../lib/security/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../lib/security/rate-limit")>()),
  checkWidgetBookingLimit: async () => true,
}));

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { POST as contactRoute } from "../app/api/public/contact/route";

describe("contact widget", { timeout: 30_000 }, () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  let tenantId: string;
  let publicKey: string;

  const send = (body: Record<string, unknown>) =>
    contactRoute(
      new Request("http://localhost/api/public/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: publicKey, website: "", elapsedMs: 8_000, ...body }),
      }),
    );

  beforeAll(async () => {
    const tenant = await createTenant(admin, { name: "Test Contact", slug: `test-contact-${suffix}` });
    tenantId = tenant.id;
    publicKey = tenant.public_widget_key;
    // Offer both consent boxes.
    await admin.from("widget_instances").insert({
      tenant_id: tenantId,
      type: "contact",
      settings: { offerNewsletter: true, offerPromotions: true },
    });
  });

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("keeps a message and a lead, tells the owner, and makes no customer without consent", async () => {
    const res = await send({ answers: { full_name: "No Consent", email: "nc@example.com", message: "Do you do braids?" } });
    expect(res.status).toBe(200);
    await settle();
    const { data: message } = await admin.from("contact_messages").select("contact_id, lead_id, status").eq("email", "nc@example.com").single();
    expect(message).toMatchObject({ contact_id: null, status: "new" });
    const { data: lead } = await admin.from("leads").select("source, summary").eq("id", message!.lead_id).single();
    expect(lead).toEqual({ source: "contact_widget", summary: "Do you do braids?" });
    expect(ownerAlerts).toHaveBeenCalledWith(expect.anything(), tenantId, expect.any(String), expect.objectContaining({ name: "No Consent" }));
    const { data: contacts } = await admin.from("contacts").select("id").eq("tenant_id", tenantId);
    expect(contacts).toEqual([]);
  });

  it("records each ticked consent, and saves the sender as a customer", async () => {
    const res = await send({
      answers: { full_name: "With Consent", phone: "083 000 0097", message: "Keep me posted" },
      newsletter: true,
      promotions: true,
    });
    expect(res.status).toBe(200);
    const { data: contact } = await admin
      .from("contacts")
      .select("id, marketing_opt_in_at, consents(kind, granted, source)")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", "27830000097")
      .single();
    expect(contact?.marketing_opt_in_at).toBeTruthy();
    expect(contact?.consents).toEqual(
      expect.arrayContaining([
        { kind: "newsletter", granted: true, source: "contact_widget" },
        { kind: "marketing", granted: true, source: "contact_widget" },
      ]),
    );
    const { data: message } = await admin.from("contact_messages").select("contact_id").eq("phone", "083 000 0097").single();
    expect(message?.contact_id).toBe(contact!.id);
  });

  it("ignores consent boxes the business doesn't offer", async () => {
    await admin.from("widget_instances").update({ settings: { offerNewsletter: false, offerPromotions: false } }).eq("tenant_id", tenantId);
    await send({ answers: { full_name: "Sneaky", email: "sneaky@example.com", message: "Hi" }, newsletter: true });
    const { data } = await admin.from("contacts").select("id").eq("tenant_id", tenantId).eq("email", "sneaky@example.com");
    expect(data).toEqual([]);
  });

  it("refuses a message with no way to reply, and quietly drops bots", async () => {
    const noReply = await send({ answers: { full_name: "Nobody", message: "Hello?" } });
    expect(noReply.status).toBe(400);
    expect((await noReply.json()).error).toMatch(/email address or a phone/);

    const bot = await send({ answers: { full_name: "Bot", email: "bot@example.com", message: "Buy now" }, website: "spam.example" });
    expect(bot.status).toBe(200);
    const { data } = await admin.from("contact_messages").select("id").eq("email", "bot@example.com");
    expect(data).toEqual([]);
  });
});
