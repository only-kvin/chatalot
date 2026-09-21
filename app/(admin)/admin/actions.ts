"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createTenant } from "@/lib/db/create-tenant";

const createTenantSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  ownerEmail: z.string().email().optional().or(z.literal("")),
});

export async function createTenantAction(formData: FormData) {
  // Re-check admin status server-side — the layout gate isn't enough on its own,
  // since Server Actions can be invoked directly.
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

  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    ownerEmail: formData.get("ownerEmail"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const admin = createAdminClient();

  let ownerUserId: string | undefined;
  if (parsed.data.ownerEmail) {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw new Error(listError.message);
    const owner = listData.users.find(
      (u) => u.email?.toLowerCase() === parsed.data.ownerEmail!.toLowerCase(),
    );
    if (!owner) {
      throw new Error(
        `No account found for ${parsed.data.ownerEmail}. They need to sign in via /login at least once first.`,
      );
    }
    ownerUserId = owner.id;
  }

  await createTenant(admin, {
    name: parsed.data.name,
    slug: parsed.data.slug,
    ownerUserId,
  });

  revalidatePath("/admin");
}
