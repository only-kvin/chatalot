import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { checkWidgetBookingLimit } from "@/lib/security/rate-limit";
import { loadWidget } from "@/lib/widgets/config";
import { splitAnswers, submissionSchema } from "@/lib/widgets/fields";
import { bookFromWidget } from "@/lib/widgets/book";
import { looksLikeBot } from "@/lib/widgets/spam";
import { clientIp, preflight, resolvePublicTenant } from "@/lib/widgets/public-request";

export const OPTIONS = preflight;

function staffChoiceAllowed(settings: Record<string, unknown>, staffId: string | null): string | null {
  return settings.allowStaffChoice === false ? null : staffId;
}

const bodySchema = z.object({
  key: z.string().min(1).max(100),
  widget: z.enum(["schedule", "appointment"]),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  // Checked against the business's stored form fields below.
  answers: z.record(z.string(), z.unknown()),
  // POPIA: the customer agreed to their details being stored and used for
  // this booking.
  consent: z.literal(true),
  // Generated once per form in the browser; a retry books once.
  idempotencyKey: z.string().min(8).max(100),
  // Anti-spam: a field humans never see, and how long the form was open.
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative(),
});

// A customer booking from a website widget. The time is re-checked against
// the live calendar and booked under the calendar lock; errors never say
// anything about other customers.
export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  // The key is read on its own so a form with a mistake still gets a
  // readable error (with CORS headers) rather than "not found".
  const key = json && typeof json === "object" && "key" in json && typeof json.key === "string" ? json.key : null;
  const resolved = await resolvePublicTenant(request, key, "bookings");
  if (resolved instanceof Response) return resolved;
  const { tenantId, headers } = resolved;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "consent");
    return NextResponse.json(
      { error: consentMissing ? "Please agree to us saving your details for this booking." : "Invalid request" },
      { status: 400, headers },
    );
  }
  const body = parsed.data;

  if (!(await checkWidgetBookingLimit(clientIp(request), body.key))) {
    return NextResponse.json({ error: "Too many bookings from here. Please try again later." }, { status: 429, headers });
  }
  // Looks like success to a bot, so it doesn't learn to adapt.
  if (looksLikeBot({ honeypot: body.website, elapsedMs: body.elapsedMs })) {
    return NextResponse.json({ ok: true, status: "confirmed", ref: "", startsAt: null, endsAt: null }, { headers });
  }

  const admin = createAdminClient();
  const [widget, { data: service }] = await Promise.all([
    loadWidget(admin, tenantId, body.widget),
    admin
      .from("services")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", body.serviceId)
      .eq("active", true)
      .eq("online_bookable", true)
      .maybeSingle(),
  ]);
  if (!widget.active || !service) return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  const answers = submissionSchema(widget.fields).safeParse(body.answers);
  if (!answers.success) {
    return NextResponse.json({ error: answers.error.issues[0]?.message ?? "Please check your details." }, { status: 400, headers });
  }

  const booked = await bookFromWidget(admin, {
    tenantId,
    serviceId: body.serviceId,
    // The schedule widget can hide the staff choice; the appointment widget
    // always offers it (with "any" when allowed).
    staffId: staffChoiceAllowed(widget.settings, body.staffId ?? null),
    date: body.date,
    time: body.time,
    answers: splitAnswers(answers.data),
    idempotencyKey: body.idempotencyKey,
    widget: body.widget,
  });
  if (!booked.ok) {
    if (booked.reason === "slot_taken" || booked.reason === "unavailable") {
      return NextResponse.json(
        { error: "Sorry, that time was just taken. Please pick another.", reason: "slot_taken" },
        { status: 409, headers },
      );
    }
    return NextResponse.json({ error: "We couldn't make the booking. Please try again." }, { status: 500, headers });
  }

  // Who it's with, so "Any available" can say who it turned out to be.
  const { data: person } = booked.staffId
    ? await admin.from("staff").select("name").eq("tenant_id", tenantId).eq("id", booked.staffId).maybeSingle()
    : { data: null };
  return NextResponse.json(
    { ok: true, status: booked.status, ref: booked.ref, startsAt: booked.startsAt, endsAt: booked.endsAt, staffName: person?.name ?? null },
    { headers },
  );
}
