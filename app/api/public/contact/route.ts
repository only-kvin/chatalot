import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetBookingLimit } from "@/lib/security/rate-limit";
import { loadWidget } from "@/lib/widgets/config";
import { splitContactAnswers, submissionSchema } from "@/lib/widgets/fields";
import { submitContactMessage } from "@/lib/widgets/contact";
import { looksLikeBot } from "@/lib/widgets/spam";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

const bodySchema = z.object({
  key: z.string().min(1).max(100),
  answers: z.record(z.string(), z.unknown()),
  // The optional, unticked boxes; only offered ones are honoured.
  newsletter: z.boolean().default(false),
  promotions: z.boolean().default(false),
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative(),
});

// A message from a website contact widget. Same front door and spam checks
// as bookings; answers are checked against the business's stored form.
export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const key = json && typeof json === "object" && "key" in json && typeof json.key === "string" ? json.key : null;
  const resolved = await resolvePublicTenant(request, key, "contact_form");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  const body = parsed.data;

  if (!(await checkWidgetBookingLimit(clientIp(request), body.key))) {
    return NextResponse.json({ error: "Too many messages from here. Please try again later." }, { status: 429, headers });
  }
  // Looks like success to a bot, so it doesn't learn to adapt.
  if (looksLikeBot({ honeypot: body.website, elapsedMs: body.elapsedMs })) {
    return NextResponse.json({ ok: true }, { headers });
  }

  const admin = createAdminClient();
  const widget = await loadWidget(admin, tenantId, "contact");
  if (!widget.active) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const answers = submissionSchema(widget.fields, "contact").safeParse(body.answers);
  if (!answers.success) {
    return NextResponse.json({ error: answers.error.issues[0]?.message ?? "Please check your details." }, { status: 400, headers });
  }

  const result = await submitContactMessage(admin, {
    tenantId,
    answers: splitContactAnswers(answers.data),
    consents: [
      { kind: "newsletter", granted: widget.settings.offerNewsletter && body.newsletter },
      { kind: "marketing", granted: widget.settings.offerPromotions && body.promotions },
    ],
  });
  if (!result.ok) return NextResponse.json({ error: "We couldn't send your message. Please try again." }, { status: 500, headers });
  return NextResponse.json({ ok: true }, { headers });
}
