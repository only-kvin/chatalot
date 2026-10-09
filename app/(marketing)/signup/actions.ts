"use server";

import { headers } from "next/headers";
import { appUrl } from "@/lib/app-url";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";
import { checkSignupLimit } from "@/lib/security/rate-limit";
import { checkSignup, saveSignup, signupSchema } from "@/lib/signup";
import { looksLikeBot } from "@/lib/widgets/spam";

export type SignupFormState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<string, string>>; signIn?: boolean };

// Step 1 of sign-up: check the details, record them, and email a magic link.
// Nothing is created until the link is clicked (app/(marketing)/signup/complete).
export async function startSignup(_prev: SignupFormState, formData: FormData): Promise<SignupFormState> {
  // Bots get the success screen and nothing happens, so they don't adapt.
  const honeypot = String(formData.get("website") ?? "");
  const elapsedMs = Number(formData.get("elapsedMs") ?? 0) || 0;
  if (looksLikeBot({ honeypot, elapsedMs })) {
    return { status: "sent", email: String(formData.get("email") ?? "") };
  }

  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "")] ??= issue.message;
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkSignupLimit(ip, input.email))) {
    return { status: "error", message: "Too many sign-up attempts. Please try again in an hour." };
  }

  const admin = createAdminClient();
  const check = await checkSignup(admin, input.email);
  if (!check.ok) {
    return {
      status: "error",
      signIn: true,
      message:
        check.reason === "used"
          ? "This email has already been used for a trial. Sign in to carry on where you left off."
          : "This email already has an account. Sign in instead.",
    };
  }

  try {
    await saveSignup(admin, input, check.resend);
  } catch (err) {
    console.error("Saving a sign-up failed:", err);
    return { status: "error", message: "We couldn't start your sign-up. Please try again." };
  }

  // The link must come back to the site the form was on (production, a
  // preview, or localhost), so use this request's origin when there is one.
  const origin = h.get("origin") ?? appUrl();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: { emailRedirectTo: `${origin}/callback?next=${encodeURIComponent("/signup/complete")}` },
  });
  if (error) {
    console.error("Sending the sign-up link failed:", error.message);
    return { status: "error", message: "We couldn't send your email just now. Please try again in a few minutes." };
  }
  return { status: "sent", email: input.email };
}
