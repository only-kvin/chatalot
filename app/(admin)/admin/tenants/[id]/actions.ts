"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { encrypt } from "@/lib/security/crypto";
import { overridesSchema, PLANS } from "@/lib/plans";

const connectSchema = z.object({
  tenantId: z.string().uuid(),
  // Meta's numeric ID for the number, not the phone number itself — the
  // webhook matches incoming messages on this exact value.
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{10,20}$/,"Use the Phone Number ID from Meta (digits only), not the phone number itself."),
  accessToken: z.string().min(1, "Access token is required"),
});

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) throw new Error("Not authorized");
}

export async function connectWhatsAppChannelAction(formData: FormData) {
  await requirePlatformAdmin();

  const parsed = connectSchema.safeParse({
    tenantId: formData.get("tenantId"),
    phoneNumberId: formData.get("phoneNumberId"),
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const admin = createAdminClient();
  const encryptedToken = encrypt(parsed.data.accessToken);

  const { data: existing } = await admin
    .from("channels")
    .select("id")
    .eq("tenant_id", parsed.data.tenantId)
    .eq("type", "whatsapp")
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("channels")
      .update({
        wa_phone_number_id: parsed.data.phoneNumberId,
        wa_access_token_encrypted: encryptedToken,
        status: "active",
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("channels").insert({
      tenant_id: parsed.data.tenantId,
      type: "whatsapp",
      wa_phone_number_id: parsed.data.phoneNumberId,
      wa_access_token_encrypted: encryptedToken,
      status: "active",
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
}

export async function disconnectWhatsAppChannelAction(formData: FormData) {
  await requirePlatformAdmin();
  const tenantId = formData.get("tenantId") as string;

  const admin = createAdminClient();
  const { error } = await admin
    .from("channels")
    .update({ status: "disabled" })
    .eq("tenant_id", tenantId)
    .eq("type", "whatsapp");
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tenants/${tenantId}`);
}

const planSchema = z.object({
  tenantId: z.string().uuid(),
  plan: z.enum(PLANS),
  overrides: overridesSchema,
});

// Plan and per-feature overrides. Returns errors rather than throwing (they're
// shown inline). Runs on the admin's own client: `tenants` RLS only lets
// platform admins update it.
export async function updatePlanAction(input: {
  tenantId: string;
  plan: string;
  overrides: Record<string, string>;
}): Promise<{ error: string | null }> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid plan settings." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({ plan: parsed.data.plan, feature_overrides: parsed.data.overrides })
    .eq("id", parsed.data.tenantId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error(`Saving plan for ${parsed.data.tenantId} failed:`, error);
    return { error: "Couldn't save. Are you signed in as a platform admin?" };
  }
  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath("/admin");
  return { error: null };
}

export async function markUpgradeHandledAction(formData: FormData) {
  await requirePlatformAdmin();
  const id = z.string().uuid().parse(formData.get("requestId"));
  const tenantId = z.string().uuid().parse(formData.get("tenantId"));
  const supabase = await createClient();
  await supabase
    .from("upgrade_requests")
    .update({ handled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
}
