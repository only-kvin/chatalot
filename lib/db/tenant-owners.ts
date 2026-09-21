import type { SupabaseClient } from "@supabase/supabase-js";

export async function getTenantOwnerEmails(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data: members } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner");

  if (!members?.length) return [];

  const emails: string[] = [];
  for (const member of members) {
    const { data } = await admin.auth.admin.getUserById(member.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}
