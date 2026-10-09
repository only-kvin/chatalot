import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getSessionUser } from "@/lib/db/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { sendPlatformAdminEmail } from "@/lib/email/send";
import { completeSignup } from "@/lib/signup";

// Step 2 of sign-up: the magic link lands here (via /callback) once the
// email is confirmed. Creates the pending trial business, tells the platform
// admins, and opens the dashboard. Safe to hit twice: a second visit just
// opens the dashboard of the business the first one made.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const user = await getSessionUser();
  if (!user?.email) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/signup/complete")}`);
  }

  const admin = createAdminClient();
  const result = await completeSignup(admin, user.id, user.email);

  if (!result.ok) {
    // Already in a business: just go there.
    if (result.reason === "member") return NextResponse.redirect(`${origin}/dashboard`);
    return NextResponse.redirect(`${origin}/signup?error=${result.reason}`);
  }

  if (result.created) {
    waitUntil(notifyAdmins(admin, result.tenantId, user.email));
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}

async function notifyAdmins(admin: ReturnType<typeof createAdminClient>, tenantId: string, email: string) {
  const { data: tenant } = await admin.from("tenants").select("name, business_type").eq("id", tenantId).single();
  await sendPlatformAdminEmail(admin, {
    subject: `New trial sign-up: ${tenant?.name ?? email}`,
    intro: "A business signed up for a trial and is waiting for your approval. It can set things up meanwhile; nothing is public until you approve it.",
    details: [
      ["Business", tenant?.name ?? null],
      ["Type", tenant?.business_type ?? null],
      ["Email", email],
    ],
    path: "/admin",
  });
}
