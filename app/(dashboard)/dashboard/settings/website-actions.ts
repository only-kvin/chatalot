"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { BUSINESS_CONSENT_KINDS, recordConsent } from "@/lib/consent/business-consent";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { getSessionUser } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";
import { sendPlatformAdminEmail } from "@/lib/email/send";
import { setupComplete } from "@/lib/onboarding";
import { generateSiteBrief, withdrawWebsiteContent } from "@/lib/site-brief/generate";

// Settings → Your website. Consent answers are the business owner's to give,
// so they're refused for staff. The tenant always comes from the session.

type Result = { error: string | null };

async function ownerContext(): Promise<{ tenantId: string; userId: string; bookings: boolean } | { error: string }> {
  const [user, current] = await Promise.all([getSessionUser(), currentTenantFeatures()]);
  if (!user || !current) return { error: "Not authorized." };
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", current.tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner") return { error: "Only the business owner can change this." };
  return { tenantId: current.tenantId, userId: user.id, bookings: current.features.bookings === "on" };
}

export async function setWebsiteConsentAction(kind: string, granted: boolean): Promise<Result> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const parsedKind = z.enum(BUSINESS_CONSENT_KINDS).safeParse(kind);
  if (!parsedKind.success || typeof granted !== "boolean") return { error: "Invalid choice." };

  const admin = createAdminClient();
  try {
    if (parsedKind.data === "website_content" && !granted) {
      // Removes the imported website knowledge and withdraws existing briefs.
      await withdrawWebsiteContent(admin, ctx.tenantId, { userId: ctx.userId, source: "settings" });
    } else {
      await recordConsent(admin, { tenantId: ctx.tenantId, kind: parsedKind.data, granted, source: "settings", grantedBy: ctx.userId });
    }
  } catch (err) {
    console.error("Saving a website consent failed:", err);
    return { error: "Couldn't save your answer. Please try again." };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/knowledge");
  return { error: null };
}

export async function requestSiteBriefAction(): Promise<Result> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  // Briefs are made from current data, so set-up must be finished first.
  if (!(await setupComplete(await createClient(), ctx.tenantId, ctx.bookings))) {
    return { error: "Finish the set-up checklist on your Overview first, so the brief uses your current details." };
  }
  try {
    await generateSiteBrief(createAdminClient(), ctx.tenantId, { createdBy: ctx.userId });
  } catch (err) {
    console.error("Making a site brief failed:", err);
    return { error: "Couldn't prepare the brief just now. Please try again in a few minutes." };
  }
  revalidatePath("/dashboard/settings");
  return { error: null };
}

export async function requestNewWebsiteAction(): Promise<Result> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const admin = createAdminClient();
  const { error } = await admin.from("website_requests").insert({ tenant_id: ctx.tenantId, requested_by: ctx.userId });
  // An open request already exists: nothing more to do.
  if (error && error.code !== "23505") {
    console.error("Saving a website request failed:", error);
    return { error: "Couldn't send your request. Please try again." };
  }
  if (!error) {
    waitUntil(
      (async () => {
        const { data: tenant } = await admin.from("tenants").select("name").eq("id", ctx.tenantId).single();
        await sendPlatformAdminEmail(admin, {
          subject: `Website request: ${tenant?.name ?? "a business"}`,
          intro: "A business asked for a new website. Their latest brief is on the Site briefs page.",
          details: [["Business", tenant?.name ?? null]],
          path: `/admin/tenants/${ctx.tenantId}`,
        });
      })(),
    );
  }
  revalidatePath("/dashboard/settings");
  return { error: null };
}
