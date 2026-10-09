import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/db/auth";
import { createClient } from "@/lib/db/supabase-server";

// The site-brief export API (/api/admin/site-briefs): who may call it, and
// the JSON it returns. The shape is versioned (EXPORT_VERSION) and
// documented in docs/SETUP.md, so automation (n8n, scripts) can rely on it.

export const EXPORT_VERSION = 1;

// A platform admin's session, or the automation token in
// "Authorization: Bearer <SITE_BRIEFS_API_TOKEN>".
export async function authorizeBriefsApi(request: Request): Promise<boolean> {
  const token = process.env.SITE_BRIEFS_API_TOKEN;
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    // A token was sent: it alone decides, and must match exactly.
    if (!token || token.length < 32) return false;
    const given = Buffer.from(header.slice(7));
    const expected = Buffer.from(token);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
  const user = await getSessionUser();
  if (!user) return false;
  const { data } = await (await createClient()).from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
}

export const BRIEF_COLUMNS =
  "id, tenant_id, version, status, profile, profile_schema_version, prompt_markdown, image_policy, data_snapshot_at, missing, conflicts, lovable_project_url, live_domain, created_at, updated_at, tenants(name, slug, business_type)";

type BriefRow = {
  id: string;
  tenant_id: string;
  version: number;
  status: string;
  profile: unknown;
  profile_schema_version: number;
  prompt_markdown: string;
  image_policy: string;
  data_snapshot_at: string;
  missing: string[];
  conflicts: unknown[];
  lovable_project_url: string | null;
  live_domain: string | null;
  created_at: string;
  updated_at: string;
  tenants: { name: string; slug: string; business_type: string | null } | null;
};

export function toExport(row: BriefRow) {
  return {
    exportVersion: EXPORT_VERSION,
    id: row.id,
    tenant: { id: row.tenant_id, name: row.tenants?.name ?? null, slug: row.tenants?.slug ?? null, businessType: row.tenants?.business_type ?? null },
    version: row.version,
    status: row.status,
    imagePolicy: row.image_policy,
    dataSnapshotAt: row.data_snapshot_at,
    profileSchemaVersion: row.profile_schema_version,
    profile: row.profile,
    promptMarkdown: row.prompt_markdown,
    missing: row.missing,
    conflicts: row.conflicts,
    lovableProjectUrl: row.lovable_project_url,
    liveDomain: row.live_domain,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadBriefRow(admin: SupabaseClient, id: string): Promise<BriefRow | null> {
  const { data } = await admin.from("site_briefs").select(BRIEF_COLUMNS).eq("id", id).maybeSingle();
  return data as BriefRow | null;
}

export async function listBriefRows(admin: SupabaseClient, filter: { status?: string; limit?: number }): Promise<BriefRow[]> {
  let query = admin.from("site_briefs").select(BRIEF_COLUMNS).order("created_at", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as BriefRow[];
}
