import { Ratelimit } from "@upstash/ratelimit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redis } from "@/lib/redis";
import { startOfLocalDay } from "@/lib/agent/availability";

const sessionLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:session",
  limiter: Ratelimit.slidingWindow(20, "10 m"),
});

const ipLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:ip",
  limiter: Ratelimit.slidingWindow(60, "10 m"),
});

export async function checkRateLimit(sessionId: string, ip: string) {
  const [session, ipResult] = await Promise.all([
    sessionLimiter.limit(sessionId),
    ipLimiter.limit(ip),
  ]);
  return { allowed: session.success && ipResult.success };
}

// Separate from Redis — this is a per-tenant business rule (agent_configs.daily_message_cap),
// not traffic shaping, so it's checked directly against Postgres.
export async function checkDailyTenantCap(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ allowed: boolean }> {
  const { data: config } = await supabase
    .from("agent_configs")
    .select("daily_message_cap")
    .eq("tenant_id", tenantId)
    .single();

  const cap = config?.daily_message_cap ?? 200;

  // SA midnight, not the server's (UTC on Vercel, which would reset the cap at 02:00 SA time).
  const startOfDay = startOfLocalDay(new Date());

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "user")
    .gte("created_at", startOfDay.toISOString());

  return { allowed: (count ?? 0) < cap };
}
