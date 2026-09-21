"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { encrypt } from "@/lib/security/crypto";

const connectSchema = z.object({
  tenantId: z.string().uuid(),
  phoneNumberId: z.string().min(1, "Phone number ID is required"),
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
