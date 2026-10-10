import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOwnerOfUrgent, type UrgentJob } from "@/lib/email/notify-urgent";

// The report_emergency tool: marks the conversation urgent, files an urgent
// lead, alerts the owner on every channel, and hands the chat over (on
// WhatsApp the AI stops replying; on the website the chat stays open but
// the visitor is pointed at the person). Booking times are never offered
// in an urgent conversation (see check_availability in engine.ts).

export async function reportEmergency(
  admin: SupabaseClient,
  ctx: { tenantId: string; businessName: string; conversationId: string; channel: "web" | "whatsapp"; emergencyNote: string },
  reported: UrgentJob,
): Promise<string> {
  let job = reported;
  const { tenantId, conversationId } = ctx;
  // On WhatsApp their number is the chat itself: never ask for it.
  if (!job.phone && ctx.channel === "whatsapp") {
    const { data } = await admin.from("conversations").select("external_id").eq("tenant_id", tenantId).eq("id", conversationId).maybeSingle();
    if (data?.external_id) job = { ...job, phone: data.external_id };
  }
  const { error } = await admin
    .from("conversations")
    .update(ctx.channel === "whatsapp" ? { urgent: true, status: "human" } : { urgent: true })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
  if (error) console.error(`Marking conversation ${conversationId} urgent failed:`, error);

  const { error: leadError } = await admin.from("leads").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    name: job.name,
    phone: job.phone,
    interest: "Emergency call-out",
    summary: [job.problem, job.address].filter(Boolean).join(" · "),
    source: ctx.channel,
    urgent: true,
  });
  if (leadError) console.error(`Filing urgent lead for ${tenantId} failed:`, leadError);

  await notifyOwnerOfUrgent(admin, tenantId, ctx.businessName, job, conversationId);

  const note = ctx.emergencyNote.trim();
  return [
    "The owner has been alerted as an emergency and the chat is handed to them.",
    "Do not offer booking times.",
    note ? `Tell the visitor the team has been alerted, and exactly this: "${note}"` : "Tell the visitor the team has been alerted.",
    "Promise nothing else: not that someone is on the way, not a time, not a price that isn't in that message.",
    "Give no instructions of your own; only the safety advice and basic safe steps the business information itself gives.",
    job.phone ? "" : "Ask for their phone number so the team can call them back, and pass it on with save_lead (interest 'Emergency call-out').",
  ]
    .filter(Boolean)
    .join(" ");
}
