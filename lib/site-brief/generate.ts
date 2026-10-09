import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentConsents, recordConsent } from "@/lib/consent/business-consent";
import { loadTenantFeatures } from "@/lib/features";
import { removeWebsiteKnowledge } from "@/lib/website/import";
import { buildProfile, EMPTY_EXTRACTION, type OwnerData, type WebsiteData } from "./build";
import { modelExtractor, type Extractor } from "./extract";
import { fetchHomeHtml, readSiteImages, type PageHtmlFetcher } from "./images";
import { PROFILE_SCHEMA_VERSION, type SiteProfile } from "./profile";
import { renderLovablePrompt } from "./prompt";
import { widgetSnippets } from "./widgets";

// Making a site brief: read the business's data, extract facts with one
// model call, build the profile, render the Lovable prompt and store it as
// the next version. Plain server functions (no request or UI code), so the
// owner's button, the admin page and future automation all share them.

export type BriefDeps = { extract: Extractor; fetchHtml: PageHtmlFetcher };
const defaultDeps: BriefDeps = { extract: modelExtractor, fetchHtml: fetchHomeHtml };

// Website text sent to the model, so one call stays within limits.
const WEBSITE_TEXT_BUDGET = 12_000;

export async function loadOwnerData(client: SupabaseClient, tenantId: string): Promise<OwnerData & { publicKey: string }> {
  const [tenant, config, widget, services, hours, staff, knowledge] = await Promise.all([
    client.from("tenants").select("name, business_type, public_widget_key").eq("id", tenantId).single(),
    client.from("agent_configs").select("business_name, tone, handoff_contact").eq("tenant_id", tenantId).maybeSingle(),
    client.from("widget_settings").select("primary_color, whatsapp_link").eq("tenant_id", tenantId).maybeSingle(),
    client
      .from("services")
      .select("name, description, category, duration_minutes, price_cents, sort_order")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    client.from("availability_rules").select("weekday, start_time, end_time").eq("tenant_id", tenantId).is("staff_id", null),
    client.from("staff").select("name, role, avatar_url, sort_order").eq("tenant_id", tenantId).eq("active", true).order("sort_order"),
    client.from("knowledge_items").select("type, title, content").eq("tenant_id", tenantId).eq("source", "manual").order("updated_at"),
  ]);
  if (tenant.error || !tenant.data) throw new Error(`Business ${tenantId} not found`);
  return {
    publicKey: tenant.data.public_widget_key,
    businessName: config.data?.business_name || tenant.data.name,
    businessType: tenant.data.business_type,
    tone: config.data?.tone ?? null,
    handoffContact: config.data?.handoff_contact || null,
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(widget.data?.primary_color ?? "") ? widget.data!.primary_color : "#4f46e5",
    whatsappLink: widget.data?.whatsapp_link || null,
    services: (services.data ?? []).map((s) => ({
      name: s.name,
      description: s.description,
      category: s.category,
      durationMinutes: s.duration_minutes,
      priceCents: s.price_cents,
    })),
    hours: (hours.data ?? []).map((h) => ({ weekday: h.weekday, start: h.start_time, end: h.end_time })),
    staff: (staff.data ?? []).map((p) => ({ name: p.name, role: p.role, avatarUrl: p.avatar_url })),
    knowledge: knowledge.data ?? [],
  };
}

// A fingerprint of the facts a website shows (services, prices, hours,
// staff): when it changes, an existing brief is out of date.
export function dataFingerprint(owner: OwnerData): string {
  const facts = {
    services: owner.services.map((s) => [s.name, s.priceCents, s.durationMinutes, s.description]).sort(),
    hours: owner.hours.map((h) => [h.weekday, h.start, h.end]).sort(),
    staff: owner.staff.map((p) => [p.name, p.role]).sort(),
  };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

async function loadWebsite(client: SupabaseClient, tenantId: string): Promise<WebsiteData | null> {
  const [{ data: pages }, { data: latest }] = await Promise.all([
    client
      .from("knowledge_items")
      .select("title, source_url, content")
      .eq("tenant_id", tenantId)
      .eq("source", "website")
      .eq("excluded", false)
      .order("source_url"),
    client
      .from("website_imports")
      .select("start_url")
      .eq("tenant_id", tenantId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!pages?.length && !latest) return null;
  return {
    url: latest?.start_url ?? null,
    pages: (pages ?? []).map((p) => ({ title: p.title, url: p.source_url, content: p.content })),
  };
}

export async function buildSiteProfileFor(
  admin: SupabaseClient,
  tenantId: string,
  deps: BriefDeps = defaultDeps,
): Promise<{ profile: SiteProfile; owner: OwnerData & { publicKey: string } }> {
  const [owner, consents] = await Promise.all([loadOwnerData(admin, tenantId), currentConsents(admin, tenantId)]);
  const content = consents.website_content?.granted === true;
  const images = consents.website_images?.granted === true;
  // Without content consent, the website isn't even read.
  const website = content ? await loadWebsite(admin, tenantId) : null;

  const ownerText = owner.knowledge.map((k) => `[${k.type}] ${k.title}: ${k.content}`).join("\n");
  let websiteText = "";
  for (const page of website?.pages ?? []) {
    if (websiteText.length >= WEBSITE_TEXT_BUDGET) break;
    websiteText += `\n\n## ${page.title} (${page.url})\n${page.content}`.slice(0, WEBSITE_TEXT_BUDGET - websiteText.length);
  }
  const extraction = ownerText || websiteText ? await deps.extract({ businessName: owner.businessName, ownerText, websiteText }) : EMPTY_EXTRACTION;

  const html = website?.url ? await deps.fetchHtml(website.url) : null;
  const siteImages = html && website?.url ? readSiteImages(html, website.url) : null;

  const profile = buildProfile({ owner, website, extraction, images: siteImages, consents: { content, images } });
  return { profile, owner };
}

export async function generateSiteBrief(
  admin: SupabaseClient,
  tenantId: string,
  opts: { createdBy: string | null; deps?: BriefDeps },
): Promise<{ id: string; version: number }> {
  const { profile, owner } = await buildSiteProfileFor(admin, tenantId, opts.deps);
  const { features } = await loadTenantFeatures(admin, tenantId);
  const prompt = renderLovablePrompt(profile, widgetSnippets(owner.publicKey, features));

  // Next version number; retried if two briefs are made at the same moment.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await admin
      .from("site_briefs")
      .select("version")
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (last?.version ?? 0) + 1;
    const { data, error } = await admin
      .from("site_briefs")
      .insert({
        tenant_id: tenantId,
        version,
        status: profile.missing.length ? "draft" : "ready",
        profile,
        profile_schema_version: PROFILE_SCHEMA_VERSION,
        prompt_markdown: prompt,
        image_policy: profile.imagePolicy,
        data_snapshot_at: new Date().toISOString(),
        data_fingerprint: dataFingerprint(owner),
        missing: profile.missing,
        conflicts: profile.conflicts,
        created_by: opts.createdBy,
      })
      .select("id, version")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Couldn't number the new brief; please try again.");
}

// Withdrawing website-content consent: record it, remove the imported
// website knowledge, and mark the business's briefs as withdrawn.
export async function withdrawWebsiteContent(
  admin: SupabaseClient,
  tenantId: string,
  by: { userId: string | null; source: "settings" | "admin"; note?: string },
): Promise<void> {
  await recordConsent(admin, { tenantId, kind: "website_content", granted: false, source: by.source, grantedBy: by.userId, note: by.note });
  await removeWebsiteKnowledge(admin, tenantId);
  const { error } = await admin
    .from("site_briefs")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .neq("status", "withdrawn");
  if (error) throw error;
}

// Whether the business's data has changed since a brief was made.
export async function briefIsStale(client: SupabaseClient, tenantId: string, fingerprint: string): Promise<boolean> {
  return dataFingerprint(await loadOwnerData(client, tenantId)) !== fingerprint;
}
