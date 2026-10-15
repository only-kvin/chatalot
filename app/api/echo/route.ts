import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { createClient } from "@/lib/db/supabase-server";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { checkEchoLimit } from "@/lib/security/rate-limit";
import { runEcho, type EchoEvent } from "@/lib/echo/engine";

// Echo, the dashboard's built-in guide. Signed-in business members only; the
// conversation lives in the owner's browser tab and is sent with each turn,
// so nothing is stored and it never mixes with customer conversations.

const bodySchema = z.object({
  pathname: z.string().startsWith("/").max(300),
  // The latest turns, oldest first, ending with the owner's new message.
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine((m) => m[m.length - 1].role === "user", "must end with the owner's message"),
});

export async function POST(request: Request) {
  // Same-origin only: the dashboard is the one caller.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  }

  const user = await getSessionUser();
  const current = user ? await currentTenantFeatures() : null;
  if (!user || !current) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  if (!(await checkEchoLimit(user.id))) {
    return Response.json({ error: "That's a lot of questions at once. Give it a minute and try again." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("agent_configs")
    .select("business_name")
    .eq("tenant_id", current.tenantId)
    .maybeSingle();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runEcho({
          supabase,
          tenantId: current.tenantId,
          businessName: config?.business_name ?? "",
          features: current.features,
          pathname: parsed.data.pathname,
          messages: parsed.data.messages,
          signal: request.signal,
        })) {
          controller.enqueue(sse(event));
        }
      } catch {
        // Stopped by the owner: nobody is listening any more.
        if (!request.signal.aborted) {
          controller.enqueue(sse({ type: "error", error: "I lost my train of thought there. Try asking again?" }));
        }
      } finally {
        // A stopped request's stream is already cancelled and can't be written to.
        try {
          controller.enqueue(DONE);
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

const encoder = new TextEncoder();
const DONE = encoder.encode("data: [DONE]\n\n");

function sse(event: EchoEvent | { type: "error"; error: string }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}
