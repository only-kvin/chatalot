import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDailySummary, loadDailySummaryData, summaryDays } from "@/lib/summary/daily-summary";
import { sendOwnerEmail } from "./send";

export type DailySummaryResult = "sent" | "quiet" | "already_sent";

// Sends one tenant's morning summary to its owners, at most once per SA day.
// The day is claimed before anything is loaded, so a cron that fires twice
// can't email twice. A quiet day keeps its claim and sends nothing.
export async function sendDailySummary(
  admin: SupabaseClient,
  tenant: { tenantId: string; businessName: string },
  now = new Date(),
): Promise<DailySummaryResult> {
  const { todayISO } = summaryDays(now);
  const { data: claimed, error } = await admin
    .from("agent_configs")
    .update({ daily_summary_sent_on: todayISO })
    .eq("tenant_id", tenant.tenantId)
    .eq("daily_summary_enabled", true)
    .or(`daily_summary_sent_on.is.null,daily_summary_sent_on.lt.${todayISO}`)
    .select("tenant_id");
  if (error) throw error;
  if (!claimed?.length) return "already_sent";

  const data = await loadDailySummaryData(admin, tenant.tenantId, tenant.businessName, now);
  const email = buildDailySummary(data);
  if (!email) return "quiet";

  await sendOwnerEmail(admin, tenant.tenantId, email);
  return "sent";
}
