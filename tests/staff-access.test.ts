// Staff logins and the inbox previews, against the real dev Supabase — needs
// .env.local populated. Run with: pnpm test
//
// A staff login must only ever link to an invite for its exact email, and
// must get nothing from the business through RLS (its schedule is read
// server-side, filtered to its own staff rows).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { staffSeatsFor } from "../lib/staff/access";
import { renderStaffAlert } from "../lib/email/notify-staff";

const PASSWORD = "test-password-0123!";

describe("staff access", () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  // "_" is a LIKE wildcard: the look-alike address must not take this invite.
  const invitedEmail = `staff_a-${suffix}@example.com`;
  const lookalikeEmail = `staffxa-${suffix}@example.com`;
  const ownerEmail = `staff-owner-${suffix}@example.com`;

  let tenantId: string;
  let otherTenantId: string;
  let staffUserId: string;
  let lookalikeUserId: string;
  let ownerId: string;
  let invitedStaffId: string;
  let uninvitedStaffId: string;
  let conversationId: string;
  let otherConversationId: string;

  beforeAll(async () => {
    tenantId = (await createTenant(admin, { name: "Staff Test", slug: `staff-test-${suffix}` })).id;
    otherTenantId = (await createTenant(admin, { name: "Staff Test Other", slug: `staff-test-other-${suffix}` })).id;

    const make = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (error) throw error;
      return data.user.id;
    };
    staffUserId = await make(invitedEmail);
    lookalikeUserId = await make(lookalikeEmail);
    ownerId = await make(ownerEmail);
    await admin.from("tenant_members").insert({ tenant_id: tenantId, user_id: ownerId, role: "owner" });

    const { data: staff, error } = await admin
      .from("staff")
      .insert([
        { tenant_id: tenantId, name: "Invited", email: invitedEmail, invited_at: new Date().toISOString() },
        // Same email as the look-alike user, but never invited.
        { tenant_id: tenantId, name: "Not invited", email: lookalikeEmail },
      ])
      .select("id, name");
    if (error) throw error;
    invitedStaffId = staff.find((s) => s.name === "Invited")!.id;
    uninvitedStaffId = staff.find((s) => s.name === "Not invited")!.id;

    const { data: convs, error: convError } = await admin
      .from("conversations")
      .insert([
        { tenant_id: tenantId, channel: "web", external_id: `staff-test-${suffix}` },
        { tenant_id: otherTenantId, channel: "web", external_id: `staff-test-other-${suffix}` },
      ])
      .select("id, tenant_id");
    if (convError) throw convError;
    conversationId = convs.find((c) => c.tenant_id === tenantId)!.id;
    otherConversationId = convs.find((c) => c.tenant_id === otherTenantId)!.id;
    const { error: msgError } = await admin.from("messages").insert([
      { tenant_id: tenantId, conversation_id: conversationId, role: "user", content: "first", created_at: "2026-01-01T10:00:00Z" },
      { tenant_id: tenantId, conversation_id: conversationId, role: "assistant", content: "latest reply", created_at: "2026-01-01T10:01:00Z" },
      { tenant_id: otherTenantId, conversation_id: otherConversationId, role: "user", content: "OTHER_TENANT_SECRET", created_at: "2026-01-01T10:00:00Z" },
    ]);
    if (msgError) throw msgError;
  });

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, otherTenantId]);
    for (const id of [staffUserId, lookalikeUserId, ownerId]) await admin.auth.admin.deleteUser(id);
  });

  it("doesn't let a look-alike email take an invite, or link without one", async () => {
    expect(await staffSeatsFor(admin, lookalikeUserId, lookalikeEmail)).toEqual([]);
    const { data } = await admin.from("staff").select("id, user_id").in("id", [invitedStaffId, uninvitedStaffId]);
    expect(data?.every((s) => s.user_id === null)).toBe(true);
  });

  it("links the invited person on sign-in, whatever the email's case", async () => {
    const seats = await staffSeatsFor(admin, staffUserId, invitedEmail.toUpperCase());
    expect(seats).toEqual([expect.objectContaining({ staffId: invitedStaffId, tenantId })]);
  });

  it("gives a signed-in staff member nothing through RLS", async () => {
    const client: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { error } = await client.auth.signInWithPassword({ email: invitedEmail, password: PASSWORD });
    expect(error).toBeNull();
    for (const table of ["staff", "bookings", "conversations", "messages", "contacts", "leads"]) {
      const { data } = await client.from(table).select("id").eq("tenant_id", tenantId);
      expect(data ?? [], table).toEqual([]);
    }
    const { data: previews } = await client.rpc("conversation_previews", { p_tenant_id: tenantId, p_ids: [conversationId] });
    expect(previews ?? []).toEqual([]);
  });

  it("loses the seat when deactivated", async () => {
    await admin.from("staff").update({ active: false }).eq("id", invitedStaffId);
    expect(await staffSeatsFor(admin, staffUserId, invitedEmail)).toEqual([]);
  });

  it("shows the owner each chat's latest message, and never another business's", async () => {
    const client: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    await client.auth.signInWithPassword({ email: ownerEmail, password: PASSWORD });
    const { data, error } = await client.rpc("conversation_previews", {
      p_tenant_id: tenantId,
      p_ids: [conversationId, otherConversationId],
    });
    expect(error).toBeNull();
    expect(data).toEqual([expect.objectContaining({ conversation_id: conversationId, content: "latest reply" })]);
    const { data: other } = await client.rpc("conversation_previews", { p_tenant_id: otherTenantId, p_ids: [otherConversationId] });
    expect(other ?? []).toEqual([]);
  });
});

describe("staff booking alert", () => {
  it("names the service, time and customer, and opens their schedule", () => {
    const email = renderStaffAlert("new", {
      customer: "Zanele M.",
      serviceName: "Knotless braids",
      when: "Saturday 18 October at 08:00",
      address: null,
      businessName: "Amara Hair Studio",
    });
    expect(email.subject).toBe("New booking: Knotless braids, Saturday 18 October at 08:00 (Amara Hair Studio)");
    expect(email.path).toBe("/schedule");
    expect(email.details).toContainEqual(["Customer", "Zanele M."]);
  });
});
