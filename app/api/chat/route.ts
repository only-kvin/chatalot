import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isOriginAllowed } from "@/lib/security/origin-check";
import { checkRateLimit, checkDailyTenantCap } from "@/lib/security/rate-limit";
import { runAgent } from "@/lib/agent/engine";
import { wantsHuman } from "@/lib/agent/handoff-intent";
import { notifyOwnerHumanRequested } from "@/lib/email/notify-human-requested";
import {
  type ChatAction,
  webHandoffMessage,
  webTakenOverMessage,
  whatsappAction,
  whatsappContinueUrl,
} from "@/lib/channels/web-handoff";

const bodySchema = z.object({
  key: z.string().min(1),
  sessionId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Preflight carries no body, so the widget key (and so the tenant's allowed
// domains) is unknown here. Echoing the origin is harmless: the real POST
// response only carries CORS headers once the origin has been checked, so a
// disallowed site still can't read anything.
export async function OPTIONS(request: Request) {
  return new Response(null, { headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }
  const { key, sessionId, message } = parsed.data;

  const admin = createAdminClient();

  // Error responses before the origin check deliberately carry no CORS
  // headers, so other sites can't read them.
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status, allowed_domains")
    .eq("public_widget_key", key)
    .single();

  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (!isOriginAllowed(origin, tenant.allowed_domains)) {
    return Response.json(
      { error: "Origin not allowed" },
      { status: 403 },
    );
  }

  const { allowed: rateOk } = await checkRateLimit(sessionId, ip);
  if (!rateOk) {
    return Response.json(
      { error: "Too many messages, please slow down." },
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  // One conversation per (tenant, channel, session).
  const { data: conversation } = await admin
    .from("conversations")
    .upsert(
      { tenant_id: tenant.id, channel: "web", external_id: sessionId, last_message_at: new Date().toISOString() },
      { onConflict: "tenant_id,channel,external_id" },
    )
    .select("id, status, contact_id")
    .single();

  if (!conversation) {
    return Response.json(
      { error: "Could not start conversation" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  if (conversation.contact_id) {
    // A visitor who shared their details earlier: keep "last seen" current.
    await admin
      .from("contacts")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", conversation.contact_id)
      .eq("tenant_id", tenant.id);
  }

  const [{ data: widgetSettings }, { data: agentConfig }] = await Promise.all([
    admin.from("widget_settings").select("whatsapp_link").eq("tenant_id", tenant.id).maybeSingle(),
    admin.from("agent_configs").select("business_name, handoff_contact, web_ai_enabled").eq("tenant_id", tenant.id).maybeSingle(),
  ]);
  const whatsappUrl = whatsappContinueUrl(widgetSettings?.whatsapp_link);
  const handoff = { whatsapp: whatsappUrl !== null, handoffContact: agentConfig?.handoff_contact || null };
  const headers = {
    ...corsHeaders(origin),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  const saveMessage = (role: "user" | "assistant", content: string) =>
    admin.from("messages").insert({ tenant_id: tenant.id, conversation_id: conversation.id, role, content });

  // Nobody can reply in the widget, so neither case below locks the visitor
  // out: their message is kept for the owner, and they get a fixed reply with
  // a way to reach a person (WhatsApp button, callback details).
  // Taken over from the dashboard, or the owner paused website AI altogether.
  if (conversation.status === "human" || agentConfig?.web_ai_enabled === false) {
    const reply = webTakenOverMessage(handoff);
    await saveMessage("user", message);
    await saveMessage("assistant", reply);
    return new Response(fixedReplyStream(reply, whatsappAction(whatsappUrl)), { headers });
  }

  if (wantsHuman(message)) {
    // Handled in code: the model sometimes only offers a handoff.
    const reply = webHandoffMessage(handoff);
    await saveMessage("user", message);
    await notifyOwnerHumanRequested(
      admin,
      tenant.id,
      agentConfig?.business_name ?? "",
      "A website visitor asked to speak to a person.",
      conversation.id,
    );
    await saveMessage("assistant", reply);
    return new Response(fixedReplyStream(reply, whatsappAction(whatsappUrl)), { headers });
  }

  // The cap limits AI replies only, so it's checked after the fixed replies above.
  const { allowed: capOk } = await checkDailyTenantCap(admin, tenant.id);
  if (!capOk) {
    return Response.json(
      { error: "This business has reached its daily message limit. Please try again tomorrow." },
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agent = runAgent({
          tenantId: tenant.id,
          conversationId: conversation.id,
          userMessage: message,
          channel: "web",
          whatsappAvailable: whatsappUrl !== null,
        });
        let step = await agent.next();
        while (!step.done) {
          controller.enqueue(sse({ text: step.value }));
          step = await agent.next();
        }
        // The AI handed off itself: show the button its reply points to.
        const action = step.value.handedOff ? whatsappAction(whatsappUrl) : null;
        if (action) controller.enqueue(sse({ action }));
      } catch {
        controller.enqueue(sse({ error: "Something went wrong." }));
      } finally {
        controller.enqueue(DONE);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}

const encoder = new TextEncoder();
const DONE = encoder.encode("data: [DONE]\n\n");

function sse(payload: { text?: string; action?: ChatAction; error?: string }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// A reply that doesn't come from the model, in the same SSE shape the widget reads.
function fixedReplyStream(text: string, action: ChatAction | null): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sse({ text }));
      if (action) controller.enqueue(sse({ action }));
      controller.enqueue(DONE);
      controller.close();
    },
  });
}
