import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetBookingLimit } from "@/lib/security/rate-limit";
import { loadWidget } from "@/lib/widgets/config";
import { splitRegistrationAnswers, submissionSchema } from "@/lib/widgets/fields";
import { registerCustomer } from "@/lib/widgets/register";
import { looksLikeBot } from "@/lib/widgets/spam";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

const bodySchema = z.object({
  key: z.string().min(1).max(100),
  answers: z.record(z.string(), z.unknown()),
  // Required: booking notifications are what signing up is for (POPIA).
  notifications: z.literal(true),
  // Optional and unticked by default; only honoured when offered.
  marketing: z.boolean().default(false),
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative(),
});

// A sign-up from a registration widget. Whether or not this person was
// already a customer, the answer is the same "check your email", so the
// form can't be used to find out who's registered.
export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const key = json && typeof json === "object" && "key" in json && typeof json.key === "string" ? json.key : null;
  const resolved = await resolvePublicTenant(request, key, "registration");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "notifications");
    return NextResponse.json(
      { error: consentMissing ? "Please agree to receive booking notifications to sign up." : "Invalid request" },
      { status: 400, headers },
    );
  }
  const body = parsed.data;

  if (!(await checkWidgetBookingLimit(clientIp(request), body.key))) {
    return NextResponse.json({ error: "Too many sign-ups from here. Please try again later." }, { status: 429, headers });
  }
  if (looksLikeBot({ honeypot: body.website, elapsedMs: body.elapsedMs })) {
    return NextResponse.json({ ok: true }, { headers });
  }

  const admin = createAdminClient();
  const widget = await loadWidget(admin, tenantId, "registration");
  if (!widget.active) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const answers = submissionSchema(widget.fields, "registration").safeParse(body.answers);
  if (!answers.success) {
    return NextResponse.json({ error: answers.error.issues[0]?.message ?? "Please check your details." }, { status: 400, headers });
  }

  await registerCustomer(admin, {
    tenantId,
    answers: splitRegistrationAnswers(answers.data),
    marketing: widget.settings.offerMarketing && body.marketing,
  });
  return NextResponse.json({ ok: true }, { headers });
}
