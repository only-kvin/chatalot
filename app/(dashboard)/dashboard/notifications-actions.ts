"use server";

import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

// Marks the given notifications read, or all of the tenant's unread ones when
// no ids are passed.
export async function markNotificationsReadAction(ids?: string[]): Promise<void> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return;
  const parsed = z.array(z.string().uuid()).max(100).optional().safeParse(ids);
  if (!parsed.success) return;

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("read_at", null);
  if (parsed.data?.length) query = query.in("id", parsed.data);

  const { error } = await query;
  if (error) console.error(`Marking notifications read for ${tenantId} failed:`, error);
}
