import type { SupabaseClient } from "@supabase/supabase-js";

// Keeps class sessions created eight weeks ahead (sync_class_series() in the
// database). The dashboard syncs a class when it's saved; the daily cron
// syncs every active class so the window keeps rolling forward.

export async function syncClassSeries(admin: SupabaseClient, seriesId: string): Promise<number> {
  const { data, error } = await admin.rpc("sync_class_series", { p_series_id: seriesId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function syncAllClassSeries(admin: SupabaseClient): Promise<{ series: number; created: number }> {
  const { data, error } = await admin.from("class_series").select("id").eq("active", true);
  if (error) throw error;
  let created = 0;
  for (const s of data ?? []) {
    try {
      created += await syncClassSeries(admin, s.id);
    } catch (err) {
      console.error(`Classes: syncing series ${s.id} failed:`, err);
    }
  }
  return { series: data?.length ?? 0, created };
}
