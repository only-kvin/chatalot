import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { authorizeBriefsApi, EXPORT_VERSION, listBriefRows, toExport } from "@/lib/site-brief/export";

// GET /api/admin/site-briefs?status=ready&limit=50: briefs across all
// businesses, newest first. Platform admins only (session or token).
const querySchema = z.object({
  status: z.enum(["draft", "ready", "in_build", "live", "withdrawn"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request) {
  if (!(await authorizeBriefsApi(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });
  const rows = await listBriefRows(createAdminClient(), parsed.data);
  return Response.json({ exportVersion: EXPORT_VERSION, briefs: rows.map(toExport) });
}
