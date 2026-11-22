"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { featureError } from "@/lib/dashboard-features";
import { getSessionUser } from "@/lib/db/auth";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";
import { encryptPayfastCredentials, loadPaymentAccount, payfastCredentialsSchema } from "@/lib/payments/accounts";
import { pingPayfast } from "@/lib/payments/payfast";

// Settings → Payments: the business's own PayFast account. Owner only: these
// credentials decide where customers' money goes. They're written with the
// service role (members can't touch the encrypted columns) and the tenant
// always comes from the session, never from the form.

type Result = { error: string | null; warning?: string | null };

async function ownerContext(): Promise<{ tenantId: string; userId: string } | { error: string }> {
  const blocked = await featureError("payments");
  if (blocked) return { error: blocked };
  const [user, tenantId] = await Promise.all([getSessionUser(), getCurrentTenantId()]);
  if (!user || !tenantId) return { error: "Not authorized." };
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner") return { error: "Only the business owner can change payments." };
  return { tenantId, userId: user.id };
}

const windowSchema = z.coerce
  .number()
  .int("Whole minutes only")
  .min(10, "Hold a slot for at least 10 minutes")
  .max(1440, "Hold a slot for at most 24 hours");

function revalidate() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/services");
}

export async function savePaymentAccountAction(formData: FormData): Promise<Result> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const admin = createAdminClient();

  const window = windowSchema.safeParse(formData.get("payment_window_minutes") || 30);
  if (!window.success) return { error: window.error.issues[0]?.message ?? "Invalid hold time." };

  // Blank key or passphrase = keep the saved one (they're never sent back to
  // the browser, so the form can't show them).
  let existing;
  try {
    existing = await loadPaymentAccount(admin, ctx.tenantId);
  } catch (err) {
    console.error(`Payments: reading the account for ${ctx.tenantId} failed:`, err);
    return { error: "Couldn't read your saved details. Enter the key and passphrase again." };
  }
  const key = String(formData.get("merchant_key") ?? "").trim();
  const pass = String(formData.get("passphrase") ?? "").trim();
  const parsed = payfastCredentialsSchema.safeParse({
    mode: formData.get("mode"),
    merchantId: formData.get("merchant_id") ?? "",
    merchantKey: key || existing?.secrets.merchantKey || "",
    passphrase: pass || existing?.secrets.passphrase || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your PayFast details." };

  const ping = await pingPayfast({ provider: "payfast", ...parsed.data });
  const now = new Date().toISOString();
  const { error } = await admin.from("payment_accounts").upsert(
    {
      tenant_id: ctx.tenantId,
      ...encryptPayfastCredentials(parsed.data),
      status: ping.ok ? "active" : "unverified",
      verified_at: ping.ok ? now : null,
      last_error: ping.ok ? null : ping.error,
      updated_by: ctx.userId,
      updated_at: now,
    },
    { onConflict: "tenant_id,provider" },
  );
  if (error) {
    console.error(`Payments: saving the account for ${ctx.tenantId} failed:`, error);
    return { error: "Couldn't save. Please try again." };
  }

  const { error: windowError } = await admin
    .from("agent_configs")
    .update({ payment_window_minutes: window.data, updated_at: now })
    .eq("tenant_id", ctx.tenantId);
  if (windowError) console.error(`Payments: saving the hold time for ${ctx.tenantId} failed:`, windowError);

  revalidate();
  return { error: null, warning: ping.ok ? null : `Saved, but not switched on yet: ${ping.error}` };
}

// Pings PayFast with the saved details and records the answer. A turned-off
// account stays off unless this is the owner turning it back on.
async function recheck(tenantId: string, turnOn: boolean): Promise<Result> {
  const admin = createAdminClient();
  const account = await loadPaymentAccount(admin, tenantId).catch(() => null);
  if (!account) return { error: "Save your PayFast details first." };

  const ping = await pingPayfast(account.secrets);
  const now = new Date().toISOString();
  const status = account.status === "disabled" && !turnOn ? "disabled" : ping.ok ? "active" : "unverified";
  const { error } = await admin
    .from("payment_accounts")
    .update({ status, verified_at: ping.ok ? now : null, last_error: ping.ok ? null : ping.error, updated_at: now })
    .eq("id", account.id)
    .eq("tenant_id", tenantId);
  if (error) return { error: "Couldn't save the result. Please try again." };
  revalidate();
  return ping.ok ? { error: null } : { error: ping.error };
}

export async function testPaymentAccountAction(): Promise<Result> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  return recheck(ctx.tenantId, false);
}

// Off = customers are no longer asked to pay; existing payments are untouched.
// Back on = the saved details are tested first.
export async function setPaymentsEnabledAction(enabled: boolean): Promise<Result> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  if (typeof enabled !== "boolean") return { error: "Invalid request." };
  if (enabled) return recheck(ctx.tenantId, true);

  const { error } = await createAdminClient()
    .from("payment_accounts")
    .update({ status: "disabled", updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("provider", "payfast");
  if (error) return { error: "Couldn't turn payments off. Please try again." };
  revalidate();
  return { error: null };
}
