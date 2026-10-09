import { Ratelimit } from "@upstash/ratelimit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redis } from "@/lib/redis";
import { startOfLocalDay } from "@/lib/time";

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

  // Counts AI turns, not customer messages: each turn that reached the model
  // records its token usage on exactly one row (the reply, or the customer's
  // message if the reply was discarded). Messages that never run the AI —
  // ones received while a person is handling the chat, voice-note
  // placeholders, burst messages answered by a later turn — don't use up
  // the cap.
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gt("tokens_in", 0)
    .gte("created_at", startOfDay.toISOString());

  return { allowed: (count ?? 0) < cap };
}

// Public booking widgets. Reads (services, availability) are cheap and
// frequent: a customer flicking through weeks. Bookings are rare per person,
// and each one emails the owner, so they're limited much harder.
const widgetReadLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:widget-read",
  limiter: Ratelimit.slidingWindow(120, "10 m"),
});
const widgetBookingIpLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:widget-book-ip",
  limiter: Ratelimit.slidingWindow(5, "10 m"),
});
const widgetBookingKeyLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:widget-book-key",
  limiter: Ratelimit.slidingWindow(60, "1 h"),
});

export async function checkWidgetReadLimit(ip: string): Promise<boolean> {
  return (await widgetReadLimiter.limit(ip)).success;
}

export async function checkWidgetBookingLimit(ip: string, publicKey: string): Promise<boolean> {
  const [ipResult, keyResult] = await Promise.all([
    widgetBookingIpLimiter.limit(ip),
    widgetBookingKeyLimiter.limit(publicKey),
  ]);
  return ipResult.success && keyResult.success;
}

// The marketing site's "Get a demo" form. Each request emails the platform
// admins, so a person gets a few tries and a script gets nowhere.
const demoRequestLimiter = new Ratelimit({
  redis,
  prefix: "ratelimit:demo-request",
  limiter: Ratelimit.slidingWindow(3, "10 m"),
});

export async function checkDemoRequestLimit(ip: string): Promise<boolean> {
  return (await demoRequestLimiter.limit(ip)).success;
}
