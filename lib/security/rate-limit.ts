import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { SupabaseClient } from "@supabase/supabase-js";

// Explicit url/token rather than Redis.fromEnv() — the Vercel Marketplace
// provisions Upstash under KV_REST_API_* names, not UPSTASH_REDIS_REST_*.
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

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

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "user")
    .gte("created_at", startOfDay.toISOString());

  return { allowed: (count ?? 0) < cap };
}
