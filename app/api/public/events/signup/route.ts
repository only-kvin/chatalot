import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetBookingLimit } from "@/lib/security/rate-limit";
import { loadWidget } from "@/lib/widgets/config";
import { splitAnswers, submissionSchema } from "@/lib/widgets/fields";
import { looksLikeBot } from "@/lib/widgets/spam";
import { signUpForEvent } from "@/lib/events/signup";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

const bodySchema = z.object({
  key: z.string().min(1).max(100),
  // Which widget it came from: the events widget, or Find a Class (whose
  // sessions are events too). Its form and Draft status apply.
  widget: z.enum(["events", "classes"]).default("events"),
  widgetId: z.string().uuid().nullish(),
  eventId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  answers: z.record(z.string(), z.unknown()),
  // The consent box: their details are saved as a customer (POPIA).
  consent: z.literal(true),
  idempotencyKey: z.string().min(8).max(100),
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative(),
});

const REFUSED: Record<string, [number, string]> = {
  unknown_event: [404, "That event isn't available any more."],
  not_open: [404, "That event isn't available any more."],
  closed: [409, "Sign-ups for this event have closed."],
  sold_out: [409, "Sorry, there aren't enough spots left."],
  too_many: [400, "That's more spots than one person can book here."],
};

// A sign-up from the events widget. Same front door and spam checks as
// bookings; answers are checked against the widget's stored form; spots,
// ticket limits and the amount are decided in the database.
export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const key = json && typeof json === "object" && "key" in json && typeof json.key === "string" ? json.key : null;
  const resolved = await resolvePublicTenant(request, key, "events");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Please check your details." }, { status: 400, headers });
  const body = parsed.data;

  if (!(await checkWidgetBookingLimit(clientIp(request), body.key))) {
    return NextResponse.json({ error: "Too many sign-ups from here. Please try again later." }, { status: 429, headers });
  }
  if (looksLikeBot({ honeypot: body.website, elapsedMs: body.elapsedMs })) {
    return NextResponse.json({ ok: true, payment: null }, { headers });
  }

  const admin = createAdminClient();
  const widget = await loadWidget(admin, tenantId, body.widget, body.widgetId);
  if (!widget.active) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  if (widget.status === "draft") {
    return NextResponse.json({ error: "This is a test widget, so it can't take real sign-ups yet." }, { status: 403, headers });
  }
  const answers = submissionSchema(widget.fields).safeParse(body.answers);
  if (!answers.success) {
    return NextResponse.json({ error: answers.error.issues[0]?.message ?? "Please check your details." }, { status: 400, headers });
  }
  const a = splitAnswers(answers.data);

  const result = await signUpForEvent(admin, {
    tenantId,
    eventId: body.eventId,
    widgetId: widget.id,
    quantity: body.quantity,
    customer: { name: a.name, phone: a.phone, email: a.email },
    details: { ...a.details, ...(a.notes ? { notes: a.notes } : {}) },
    idempotencyKey: body.idempotencyKey,
  });
  if (!result.ok) {
    const [status, error] = REFUSED[result.reason] ?? [500, "We couldn't sign you up. Please try again."];
    return NextResponse.json({ error, reason: result.reason, spotsLeft: result.spotsLeft ?? null }, { status, headers });
  }
  return NextResponse.json(
    {
      ok: true,
      payment: result.payment && { url: result.payment.url, amountCents: result.payment.amountCents, dueAt: result.payment.dueAt },
      payAtEvent: result.payAtEvent,
    },
    { headers },
  );
}
