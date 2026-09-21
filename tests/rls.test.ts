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

  it("rejects writes into another tenant", async () => {
    const { error } = await clientA.from("knowledge_items").insert({
      tenant_id: tenantB.id,
      type: "info",
      title: "hijack",
      content: "should not be allowed",
    });
    expect(error).not.toBeNull();
  });
});
