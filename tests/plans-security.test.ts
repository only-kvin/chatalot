// Plans can only be changed by platform admins, and upgrade requests stay
// within the owner's own tenant. Hits the real dev Supabase project, like
// rls.test.ts. Also checks that a public widget endpoint refuses a business
// whose plan lacks the feature.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { resolvePublicTenant } from "../lib/widgets/public-request";

const PASSWORD = "test-password-0123!";

describe("plan security", () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  const email = `test-plans-${suffix}@example.com`;
  let tenant: { id: string };
  let other: { id: string };
  let userId: string;
  let owner: SupabaseClient;

  beforeAll(async () => {
    tenant = await createTenant(admin, { name: "Test Plans", slug: `test-plans-${suffix}` });
    other = await createTenant(admin, { name: "Test Plans Other", slug: `test-plans-other-${suffix}` });
    await admin.from("tenants").update({ plan: "starter" }).eq("id", tenant.id);

    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const { error: memberError } = await admin
      .from("tenant_members")
      .insert({ tenant_id: tenant.id, user_id: userId, role: "owner" });
    if (memberError) throw memberError;

    owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { error: signInError } = await owner.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenant.id);
    await admin.from("tenants").delete().eq("id", other.id);
    await admin.auth.admin.deleteUser(userId);
  });

  it("lets owners read their plan but not change it", async () => {
    const { data } = await owner.from("tenants").select("plan").eq("id", tenant.id).single();
    expect(data?.plan).toBe("starter");

    await owner.from("tenants").update({ plan: "pro", feature_overrides: { bookings: "on" } }).eq("id", tenant.id);
    const { data: after } = await admin.from("tenants").select("plan, feature_overrides").eq("id", tenant.id).single();
    expect(after?.plan).toBe("starter");
    expect(after?.feature_overrides).toEqual({});
  });

  it("rejects unknown plans", async () => {
    const { error } = await admin.from("tenants").update({ plan: "platinum" }).eq("id", tenant.id);
    expect(error).not.toBeNull();
  });

  it("lets owners request upgrades for their own tenant only", async () => {
    const own = await owner.from("upgrade_requests").insert({ tenant_id: tenant.id, feature: "bookings", requested_by: userId });
    expect(own.error).toBeNull();

    const foreign = await owner
      .from("upgrade_requests")
      .insert({ tenant_id: other.id, feature: "bookings", requested_by: userId });
    expect(foreign.error).not.toBeNull();

    // One open request per feature.
    const repeat = await owner.from("upgrade_requests").insert({ tenant_id: tenant.id, feature: "bookings", requested_by: userId });
    expect(repeat.error?.code).toBe("23505");
  });

  it("doesn't let owners mark their own request handled", async () => {
    await owner.from("upgrade_requests").update({ handled_at: new Date().toISOString() }).eq("tenant_id", tenant.id);
    const { data } = await admin.from("upgrade_requests").select("handled_at").eq("tenant_id", tenant.id);
    expect(data?.every((r) => r.handled_at === null)).toBe(true);
  });

  it("hides a feature's public endpoint when it isn't on the plan", async () => {
    const { data } = await admin.from("tenants").select("public_widget_key").eq("id", tenant.id).single();
    // An own-app request skips the allowed-domain check, isolating the plan check.
    const request = () => new Request("http://localhost:3000/api/x", { headers: { "sec-fetch-site": "same-origin" } });

    const bookings = await resolvePublicTenant(request(), data!.public_widget_key, "bookings");
    expect(bookings instanceof Response && bookings.status).toBe(404);

    await admin.from("tenants").update({ feature_overrides: { bookings: "on" } }).eq("id", tenant.id);
    const granted = await resolvePublicTenant(request(), data!.public_widget_key, "bookings");
    expect(granted).not.toBeInstanceOf(Response);
  });
});
