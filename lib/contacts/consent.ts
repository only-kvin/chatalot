import type { SupabaseClient } from "@supabase/supabase-js";

// Whether ChatAlot may message a customer first (reminders, booking notices,
// later review requests and win-back). A customer who replied STOP gets none
// of these; replies to messages they send are unaffected. Checked at send
// time, not when something is scheduled, so a later STOP always wins.

// Exact whole-message keywords only: "cancel" or "stop the booking" must not
// unsubscribe anyone.
const STOP_WORDS = new Set(["stop", "stop all", "unsubscribe", "opt out", "opt-out", "optout"]);
const START_WORDS = new Set(["start", "unstop", "subscribe", "opt in", "opt-in", "optin"]);

export function consentKeyword(message: string): "stop" | "start" | null {
  const text = message.toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ").trim();
  if (STOP_WORDS.has(text)) return "stop";
  if (START_WORDS.has(text)) return "start";
  return null;
}

export const STOP_CONFIRMATION =
  "You're unsubscribed: we won't send you reminders or updates. Reply START any time to turn them back on.";
export const START_CONFIRMATION = "You're subscribed again, and our assistant is back. How can we help?";

export async function setOptedOut(
  admin: SupabaseClient,
  tenantId: string,
  contactId: string,
  optedOut: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("contacts")
    .update(
      // Opting out also withdraws any marketing opt-in.
      optedOut ? { opted_out_at: now, marketing_opt_in_at: null, updated_at: now } : { opted_out_at: null, updated_at: now },
    )
    .eq("id", contactId)
    .eq("tenant_id", tenantId);
  if (error) console.error(`Updating opt-out for contact ${contactId} failed:`, error);
}

export async function isOptedOut(
  client: SupabaseClient,
  tenantId: string,
  contactId: string | null,
): Promise<boolean> {
  if (!contactId) return false;
  const { data } = await client
    .from("contacts")
    .select("opted_out_at")
    .eq("id", contactId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data?.opted_out_at);
}
