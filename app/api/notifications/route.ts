import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

// Polled by the dashboard bell. Uses the signed-in user's client, so RLS
// limits it to their own tenant on top of the explicit tenant filter.
export async function GET() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return Response.json({ error: "Not authorized" }, { status: 401 });

  const supabase = await createClient();
  const [{ data: rows, error }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, conversation_id, read_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("read_at", null),
  ]);
  if (error) return Response.json({ error: "Couldn't load notifications" }, { status: 500 });

  return Response.json(
    {
      unread: count ?? 0,
      items: (rows ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        conversationId: r.conversation_id,
        read: r.read_at !== null,
        createdAt: r.created_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
