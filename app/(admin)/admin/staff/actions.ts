"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { getPlatformRole } from "@/lib/db/platform-role";
import { createAdminClient } from "@/lib/db/supabase-admin";

// Platform staff (the website-factory team): admins add and remove them.

type Result = { error: string | null };

async function adminUser(): Promise<{ userId: string } | { error: string }> {
  const [user, role] = await Promise.all([getSessionUser(), getPlatformRole()]);
  if (!user || role !== "admin") return { error: "Not authorized." };
  return { userId: user.id };
}

// Supabase has no lookup by email; listUsers pages through everyone.
async function findUserId(email: string): Promise<string | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function addStaffAction(formData: FormData): Promise<Result> {
  const who = await adminUser();
  if ("error" in who) return who;
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter their email address." };

  const userId = await findUserId(email.data).catch(() => null);
  if (!userId) return { error: "No account with that email. Ask them to sign in once at /login, then add them." };
  const { error } = await createAdminClient()
    .from("platform_staff")
    .upsert({ user_id: userId, added_by: who.userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) return { error: "Couldn't add them. Please try again." };
  revalidatePath("/admin/staff");
  return { error: null };
}

export async function removeStaffAction(userId: string): Promise<Result> {
  const who = await adminUser();
  if ("error" in who) return who;
  if (!z.string().uuid().safeParse(userId).success) return { error: "Invalid request." };
  const { error } = await createAdminClient().from("platform_staff").delete().eq("user_id", userId);
  if (error) return { error: "Couldn't remove them. Please try again." };
  revalidatePath("/admin/staff");
  return { error: null };
}
