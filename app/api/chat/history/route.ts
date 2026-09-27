import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isOriginAllowed } from "@/lib/security/origin-check";

const MAX_RESTORED_MESSAGES = 50;

// The session id is a random UUID that only the visitor's browser holds, so it
// acts as the bearer for reading its own transcript — requiring a UUID keeps it
// unguessable.
const querySchema = z.object({
  key: z.string().min(1),
  sessionId: z.uuid(),
});

// Lets the widget restore a visitor's conversation after a page reload.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");

  const parsed = querySchema.safeParse({
    key: url.searchParams.get("key"),
    sessionId: url.searchParams.get("sessionId"),
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { key, sessionId } = parsed.data;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status, allowed_domains")
    .eq("public_widget_key", key)
    .single();

  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!isOriginAllowed(origin, tenant.allowed_domains)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const headers = { "Access-Control-Allow-Origin": origin ?? "*" };

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("channel", "web")
    .eq("external_id", sessionId)
    .maybeSingle();
  if (!conversation) return Response.json({ messages: [] }, { headers });

  const { data: rows } = await admin
    .from("messages")
    .select("role, content")
    .eq("tenant_id", tenant.id)
    .eq("conversation_id", conversation.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(MAX_RESTORED_MESSAGES);

  return Response.json({ messages: (rows ?? []).reverse() }, { headers });
}
