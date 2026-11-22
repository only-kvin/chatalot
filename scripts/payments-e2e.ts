// End-to-end payment test against the PayFast SANDBOX, on a throwaway
// business in whatever database .env.local points at.
//
//   pnpm payments-e2e setup     creates "Payment Test (delete me)" with one
//                               service (R100, R10 deposit online), open
//                               every day 08:00-18:00, and the sandbox
//                               account from .env.local; prints its booking page
//   pnpm payments-e2e status    what happened: bookings, payments, PayFast
//                               notifications, alerts
//   pnpm payments-e2e teardown  deletes the test business and everything in it
//
// Needs the payments migration applied, and PAYFAST_SANDBOX_* in .env.local.

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { encryptPayfastCredentials, payfastCredentialsSchema } from "../lib/payments/accounts";
import { pingPayfast } from "../lib/payments/payfast";

const NAME = "Payment Test (delete me)";
const SLUG_PREFIX = "payment-test-";

const admin = createAdminClient();

async function testTenants() {
  const { data, error } = await admin.from("tenants").select("id, slug, created_at").like("slug", `${SLUG_PREFIX}%`);
  if (error) throw error;
  return data ?? [];
}

async function setup() {
  if ((await testTenants()).length) throw new Error("A test business already exists: run teardown first.");
  const creds = payfastCredentialsSchema.parse({
    mode: "sandbox",
    merchantId: process.env.PAYFAST_SANDBOX_MERCHANT_ID,
    merchantKey: process.env.PAYFAST_SANDBOX_MERCHANT_KEY,
    passphrase: process.env.PAYFAST_SANDBOX_PASSPHRASE,
  });
  const ping = await pingPayfast({ provider: "payfast", ...creds });
  if (!ping.ok) throw new Error(`PayFast sandbox refused the details: ${ping.error}`);

  const slug = `${SLUG_PREFIX}${Date.now().toString(36)}`;
  const tenant = await createTenant(admin, { name: NAME, slug });
  const steps = await Promise.all([
    admin.from("tenants").update({ plan: "pro", status: "active" }).eq("id", tenant.id),
    admin
      .from("availability_rules")
      .insert([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ tenant_id: tenant.id, weekday, start_time: "08:00", end_time: "18:00" }))),
    admin.from("services").insert({
      tenant_id: tenant.id,
      name: "Test haircut",
      description: "Sandbox payment test. No real money.",
      duration_minutes: 30,
      price_cents: 10000,
      price_type: "fixed",
      payment_mode: "deposit",
      deposit_cents: 1000,
    }),
    admin.from("payment_accounts").insert({
      tenant_id: tenant.id,
      ...encryptPayfastCredentials(creds),
      status: "active",
      verified_at: new Date().toISOString(),
    }),
  ]);
  const failed = steps.find((s) => s.error);
  if (failed?.error) throw new Error(`Setup failed: ${failed.error.message} (run teardown)`);
  console.log(`Created ${NAME}`);
  console.log(`  tenant id: ${tenant.id}`);
  console.log(`  booking page: <app url>/book/${slug}`);
}

async function status() {
  for (const t of await testTenants()) {
    const [bookings, payments, events, alerts] = await Promise.all([
      admin.from("bookings").select("id, status, payment_status, amount_due_cents, payment_due_at, starts_at").eq("tenant_id", t.id).order("created_at"),
      admin.from("payments").select("id, status, mode, amount_cents, fee_cents, net_cents, provider_payment_id, paid_at").eq("tenant_id", t.id).order("created_at"),
      admin.from("payment_events").select("outcome, reason, provider_status, received_at").eq("tenant_id", t.id).order("received_at"),
      admin.from("notifications").select("type, title, body").eq("tenant_id", t.id).order("created_at"),
    ]);
    console.log(`== ${t.slug} (${t.id})`);
    console.log("bookings:", bookings.data);
    console.log("payments:", payments.data);
    console.log("PayFast notifications:", events.data);
    console.log("owner alerts:", alerts.data);
  }
}

async function teardown() {
  for (const t of await testTenants()) {
    // Bookings first: they hold their service with "on delete restrict".
    await admin.from("bookings").delete().eq("tenant_id", t.id);
    const { error } = await admin.from("tenants").delete().eq("id", t.id);
    console.log(error ? `Couldn't delete ${t.slug}: ${error.message}` : `Deleted ${t.slug}`);
  }
}

const command = process.argv[2];
const run = command === "setup" ? setup : command === "status" ? status : command === "teardown" ? teardown : null;
if (!run) {
  console.error("Usage: pnpm payments-e2e setup|status|teardown");
  process.exit(1);
}
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
