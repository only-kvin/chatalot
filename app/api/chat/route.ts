import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isOriginAllowed } from "@/lib/security/origin-check";
import { checkRateLimit, checkDailyTenantCap } from "@/lib/security/rate-limit";
import { runAgent } from "@/lib/agent/engine";

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
      { status: 400, headers: corsHeaders(origin) },
    );
  }
  const { key, sessionId, message } = parsed.data;

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status, allowed_domains")
    .eq("public_widget_key", key)
    .single();

  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders(origin) });
  }

  if (!isOriginAllowed(origin, tenant.allowed_domains)) {
    return Response.json(
      { error: "Origin not allowed" },
      { status: 403, headers: corsHeaders(origin) },
    );
  }

  const { allowed: rateOk } = await checkRateLimit(sessionId, ip);
  if (!rateOk) {
    return Response.json(
      { error: "Too many messages, please slow down." },
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  const { allowed: capOk } = await checkDailyTenantCap(admin, tenant.id);
  if (!capOk) {
    return Response.json(
      { error: "This business has reached its daily message limit. Please try again tomorrow." },
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
    .select("id, status")
    .single();

  if (!conversation) {
    return Response.json(
      { error: "Could not start conversation" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  if (conversation.status === "human") {
    // A human has taken over — don't let the AI reply.
    return Response.json(
      { error: "This conversation is being handled by a person." },
      { status: 409, headers: corsHeaders(origin) },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of runAgent({
          tenantId: tenant.id,
          conversationId: conversation.id,
          userMessage: message,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Something went wrong." })}\n\n`),
        );
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
