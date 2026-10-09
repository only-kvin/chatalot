import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/marketing/business-types";
import { recordConsent } from "@/lib/consent/business-consent";

// Self-serve sign-up: the form's rules, the "one trial per email" check, and
// turning a confirmed email into a pending trial business. The business is
// created by public.complete_signup() (atomic and safe to repeat) and stays
// pending, hidden from the public, until a platform admin approves it.

const typeValues = BUSINESS_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]];

export const signupSchema = z.object({
  email: z
    .email("Please enter a valid email address.")
    .max(200)
    .transform((e) => e.trim().toLowerCase()),
  businessName: z.string().trim().min(1, "Please enter your business name.").max(120),
  businessType: z.enum(typeValues, { error: "Please choose your type of business." }),
  terms: z.literal("on", { error: "Please accept the terms to continue." }),
  // The two optional website consents: unticked boxes, so absent means no.
  consentWebsiteContent: z.literal("on").optional().transform(Boolean),
  consentWebsiteImages: z.literal("on").optional().transform(Boolean),
});
export type SignupInput = z.infer<typeof signupSchema>;

export type SignupCheck =
  // Fine to (re)send the confirmation link.
  | { ok: true; resend: boolean }
  | { ok: false; reason: "used" | "member" };

// One trial per email. A sign-up that was never confirmed can be resent (the
// first link may have expired); one that became a business can't be reused,
// and neither can an email that already belongs to a business.
export async function checkSignup(admin: SupabaseClient, email: string): Promise<SignupCheck> {
  const { data: signup } = await admin.from("signups").select("tenant_id, completed_at").eq("email", email).maybeSingle();
  if (signup?.completed_at) return { ok: false, reason: "used" };
  if (await emailBelongsToBusiness(admin, email)) return { ok: false, reason: "member" };
  return { ok: true, resend: Boolean(signup) };
}

async function emailBelongsToBusiness(admin: SupabaseClient, email: string): Promise<boolean> {
  const userId = await findUserIdByEmail(admin, email);
  if (!userId) return false;
  const { count } = await admin.from("tenant_members").select("tenant_id", { count: "exact", head: true }).eq("user_id", userId);
  return (count ?? 0) > 0;
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 1000) return null;
  }
}

// Records (or refreshes) the sign-up before the confirmation email goes out.
export async function saveSignup(admin: SupabaseClient, input: SignupInput, resend: boolean): Promise<void> {
  const row = {
    email: input.email,
    business_name: input.businessName,
    business_type: input.businessType,
    consent_website_content: input.consentWebsiteContent,
    consent_website_images: input.consentWebsiteImages,
  };
  const { error } = resend
    ? await admin.from("signups").update(row).eq("email", input.email).is("completed_at", null)
    : await admin.from("signups").insert(row);
  if (error) throw error;
}

export type CompleteResult =
  | { ok: true; tenantId: string; created: boolean }
  | { ok: false; reason: "no-signup" | "member" | "error" };

// Called once the user has confirmed their email (they're signed in).
export async function completeSignup(admin: SupabaseClient, userId: string, email: string): Promise<CompleteResult> {
  const { data, error } = await admin.rpc("complete_signup", { p_user_id: userId, p_email: email.toLowerCase() });
  if (error) {
    if (error.code === "P0002") return { ok: false, reason: "no-signup" };
    if (error.code === "23505") return { ok: false, reason: "member" };
    console.error("complete_signup failed:", error);
    return { ok: false, reason: "error" };
  }
  const row = (data as { tenant_id: string; created: boolean }[])[0];
  if (row.created) await recordSignupConsents(admin, row.tenant_id, userId, email);
  return { ok: true, tenantId: row.tenant_id, created: row.created };
}

// The answers to the two website questions on the sign-up form, recorded
// (yes or no) as the business's first consent history.
async function recordSignupConsents(admin: SupabaseClient, tenantId: string, userId: string, email: string): Promise<void> {
  const { data } = await admin
    .from("signups")
    .select("consent_website_content, consent_website_images")
    .eq("email", email.toLowerCase())
    .single();
  try {
    await recordConsent(admin, { tenantId, kind: "website_content", granted: Boolean(data?.consent_website_content), source: "signup", grantedBy: userId });
    await recordConsent(admin, { tenantId, kind: "website_images", granted: Boolean(data?.consent_website_images), source: "signup", grantedBy: userId });
  } catch (err) {
    // The business exists either way; the owner can answer again in Settings.
    console.error(`Recording sign-up consents for ${tenantId} failed:`, err);
  }
}
