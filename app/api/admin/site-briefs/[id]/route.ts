import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { authorizeBriefsApi, loadBriefRow, toExport } from "@/lib/site-brief/export";

// GET /api/admin/site-briefs/<id>: one brief as JSON. ?format=md downloads
// the Lovable prompt, ?format=json downloads the JSON as a file.
export async function GET(request: Request, ctx: RouteContext<"/api/admin/site-briefs/[id]">) {
  if (!(await authorizeBriefsApi(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 });
  const row = await loadBriefRow(createAdminClient(), id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const format = new URL(request.url).searchParams.get("format");
  const base = `${row.tenants?.slug ?? "business"}-brief-v${row.version}`;
  if (format === "md") {
    return new Response(row.prompt_markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.md"` },
    });
  }
  const body = toExport(row);
  if (format === "json") {
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${base}.json"` },
    });
  }
  return Response.json(body);
}
