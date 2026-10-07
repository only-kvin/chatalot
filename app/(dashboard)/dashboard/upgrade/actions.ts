"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { FEATURE_INFO, FEATURES, PLAN_LABEL, planFor } from "@/lib/plans";
import { sendPlatformAdminEmail } from "@/lib/email/send";

// "Request upgrade" on a locked feature: recorded for the admin tenant page
// and emailed to the platform admin, who upgrades them by changing the plan.
// Returns errors rather than throwing (Next.js hides thrown messages).
export async function requestUpgradeAction(feature: string): Promise<{ error: string | null }> {
  const parsed = z.enum(FEATURES).safeParse(feature);
  if (!parsed.success) return { error: "Unknown feature." };

  const current = await currentTenantFeatures();
  if (!current) return { error: "Not authorized." };
  if (current.features[parsed.data] !== "locked") return { error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized." };

  const { error } = await supabase
    .from("upgrade_requests")
    .insert({ tenant_id: current.tenantId, feature: parsed.data, requested_by: user.id });
  // 23505: an open request for this feature already exists — nothing to do.
  if (error?.code === "23505") return { error: null };
  if (error) {
    console.error(`Upgrade request for ${current.tenantId} failed:`, error);
    return { error: "Couldn't send your request. Please try again." };
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", current.tenantId).single();
  await sendPlatformAdminEmail(admin, {
    subject: `Upgrade request: ${tenant?.name ?? "A business"} wants ${FEATURE_INFO[parsed.data].title}`,
    intro: "A business asked to unlock a feature that isn't on their plan.",
    details: [
      ["Business", tenant?.name ?? null],
      ["Requested by", user.email ?? null],
      ["Feature", FEATURE_INFO[parsed.data].title],
      ["Current plan", PLAN_LABEL[current.plan]],
      ["Included from", PLAN_LABEL[planFor(parsed.data)]],
    ],
    path: `/admin/tenants/${current.tenantId}`,
  });

  revalidatePath(`/dashboard/upgrade/${parsed.data}`);
  return { error: null };
}
