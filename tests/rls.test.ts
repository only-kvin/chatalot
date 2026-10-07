// RLS isolation test: proves tenant A's user can't read or write tenant B's rows.
// Hits the real dev Supabase project (no mocking) — needs .env.local populated.
// Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";

const PASSWORD = "test-password-0123!";

function scopedClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

describe("RLS tenant isolation", () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  const emailA = `test-rls-a-${suffix}@example.com`;
  const emailB = `test-rls-b-${suffix}@example.com`;

  let tenantA: { id: string };
  let tenantB: { id: string };
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let contactBId: string;
  let serviceBId: string;
  let messageAId: string;

  beforeAll(async () => {
    tenantA = await createTenant(admin, {
      name: "Test Tenant A",
      slug: `test-tenant-a-${suffix}`,
    });
    tenantB = await createTenant(admin, {
      name: "Test Tenant B",
      slug: `test-tenant-b-${suffix}`,
    });

    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: emailA,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userAError) throw userAError;
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: emailB,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userBError) throw userBError;
    userBId = userB.user.id;

    const { error: memberAError } = await admin
      .from("tenant_members")
      .insert({ tenant_id: tenantA.id, user_id: userAId, role: "owner" });
    if (memberAError) throw memberAError;

    const { error: memberBError } = await admin
      .from("tenant_members")
      .insert({ tenant_id: tenantB.id, user_id: userBId, role: "owner" });
    if (memberBError) throw memberBError;

    const { error: knowledgeError } = await admin.from("knowledge_items").insert([
      {
        tenant_id: tenantA.id,
        type: "info",
        title: "secret",
        content: "TENANT_A_SECRET",
      },
      {
        tenant_id: tenantB.id,
        type: "info",
        title: "secret",
        content: "TENANT_B_SECRET",
      },
    ]);
    if (knowledgeError) throw knowledgeError;

    const { data: contactB, error: contactError } = await admin
      .from("contacts")
      .insert({ tenant_id: tenantB.id, name: "TENANT_B_CUSTOMER", phone_e164: "27990000002" })
      .select("id")
      .single();
    if (contactError) throw contactError;
    contactBId = contactB.id;

    const { data: serviceB, error: serviceError } = await admin
      .from("services")
      .insert({ tenant_id: tenantB.id, name: "TENANT_B_SERVICE", duration_minutes: 30 })
      .select("id")
      .single();
    if (serviceError) throw serviceError;
    serviceBId = serviceB.id;
    const { error: staffError } = await admin.from("staff").insert({ tenant_id: tenantB.id, name: "TENANT_B_STAFF" });
    if (staffError) throw staffError;

    const { data: messages, error: messageError } = await admin
      .from("contact_messages")
      .insert([
        { tenant_id: tenantA.id, name: "A", email: "a@example.com", message: "TENANT_A_MESSAGE" },
        { tenant_id: tenantB.id, name: "B", email: "b@example.com", message: "TENANT_B_MESSAGE" },
      ])
      .select("id, tenant_id");
    if (messageError) throw messageError;
    messageAId = messages.find((m) => m.tenant_id === tenantA.id)!.id;
    const { error: consentError } = await admin
      .from("consents")
      .insert({ tenant_id: tenantB.id, contact_id: contactBId, kind: "marketing", granted: true, source: "test" });
    if (consentError) throw consentError;

    clientA = scopedClient();
    const { error: signInError } = await clientA.auth.signInWithPassword({
      email: emailA,
      password: PASSWORD,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantA.id);
    await admin.from("tenants").delete().eq("id", tenantB.id);
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  });

  it("only returns the signed-in user's own tenant rows", async () => {
    const { data, error } = await clientA.from("knowledge_items").select("content");
    expect(error).toBeNull();
    const contents = data!.map((r) => r.content);
    expect(contents).toContain("TENANT_A_SECRET");
    expect(contents).not.toContain("TENANT_B_SECRET");
  });

  it("returns an empty result when explicitly querying another tenant's id", async () => {
    const { data, error } = await clientA
      .from("knowledge_items")
      .select("content")
      .eq("tenant_id", tenantB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides another tenant's customers", async () => {
    const { data, error } = await clientA.from("contacts").select("name");
    expect(error).toBeNull();
    expect(data!.map((r) => r.name)).not.toContain("TENANT_B_CUSTOMER");
  });

  it("can't delete another tenant's customer", async () => {
    const { error } = await clientA.rpc("delete_contact_with_history", { p_contact_id: contactBId });
    expect(error?.message).toContain("Customer not found");
    const { data } = await admin.from("contacts").select("id").eq("id", contactBId);
    expect(data).toHaveLength(1);
  });

  it("rejects writes into another tenant", async () => {
    const { error } = await clientA.from("knowledge_items").insert({
      tenant_id: tenantB.id,
      type: "info",
      title: "hijack",
      content: "should not be allowed",
    });
    expect(error).not.toBeNull();
  });

  it("hides another tenant's staff and refuses staff written into it", async () => {
    const { data, error } = await clientA.from("staff").select("name");
    expect(error).toBeNull();
    expect(data!.map((r) => r.name)).not.toContain("TENANT_B_STAFF");

    const { error: insertError } = await clientA.from("staff").insert({ tenant_id: tenantB.id, name: "hijack" });
    expect(insertError).not.toBeNull();
  });

  const bookingArgs = () => ({
    p_tenant_id: tenantB.id,
    p_service_id: serviceBId,
    p_staff_id: null,
    p_starts_at: "2031-01-06T08:00:00Z",
    p_name: "hijack",
    p_phone: "0820000000",
    p_email: null,
    p_contact_id: null,
    p_conversation_id: null,
    p_source: "team",
    p_notes: "",
    p_details: {},
    p_idempotency_key: null,
    p_lead_source: null,
    p_lead_summary: null,
    p_actor: "team",
    p_channel: "dashboard",
    p_created_by: userAId,
  });

  it("can't book into another tenant through create_booking", async () => {
    const { data } = await clientA.rpc("create_booking", bookingArgs());
    // RLS hides tenant B's service, so the function never gets as far as
    // inserting (and the insert itself would be refused).
    expect(data?.ok).not.toBe(true);
    const { data: bookings } = await admin.from("bookings").select("id").eq("tenant_id", tenantB.id);
    expect(bookings).toEqual([]);
  });

  it("doesn't let the public key call the booking functions", async () => {
    const { error } = await scopedClient().rpc("create_booking", bookingArgs());
    expect(error).not.toBeNull();
  });

  it("shows only the tenant's own contact messages, and only their status can be changed", async () => {
    const { data } = await clientA.from("contact_messages").select("message");
    expect(data!.map((m) => m.message)).toEqual(["TENANT_A_MESSAGE"]);

    const { error: statusError } = await clientA.from("contact_messages").update({ status: "read" }).eq("id", messageAId);
    expect(statusError).toBeNull();
    const { error: textError } = await clientA.from("contact_messages").update({ message: "rewritten" }).eq("id", messageAId);
    expect(textError).not.toBeNull();
  });

  it("keeps consent history read-only and per tenant", async () => {
    const { data } = await clientA.from("consents").select("id");
    expect(data).toEqual([]);
    const { error } = await clientA
      .from("consents")
      .insert({ tenant_id: tenantA.id, contact_id: contactBId, kind: "marketing", granted: true, source: "forged" });
    expect(error).not.toBeNull();
  });
});
