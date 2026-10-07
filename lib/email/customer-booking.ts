import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { bookingIcs } from "@/lib/bookings/ics";
import { bookingRef } from "@/lib/bookings/manage";
import { createBookingToken } from "@/lib/security/signed-token";
import { formatLocalDateTime } from "@/lib/time";
import { escapeHtml, sendCustomerEmail } from "./send";

// Emails to the customer about their booking: made (confirmed or awaiting
// approval), approved, declined, cancelled. Only for bookings with an email
// address — the widget asks for one; chat bookings usually don't have one.

export type CustomerBookingEmailKind = "confirmed" | "requested" | "approved" | "declined" | "cancelled";

const DAY_MS = 24 * 60 * 60 * 1000;
// Manage links keep working until a month after the appointment.
const LINK_GRACE_MS = 30 * DAY_MS;

export function manageBookingUrl(bookingId: string, endsAt: string): string {
  return appUrl(`/b/${createBookingToken(bookingId, new Date(new Date(endsAt).getTime() + LINK_GRACE_MS))}`);
}

type BookingForEmail = {
  id: string;
  name: string;
  email: string | null;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  staffName: string | null;
  businessName: string;
  contact: string;
};

const SUBJECT: Record<CustomerBookingEmailKind, (b: BookingForEmail) => string> = {
  confirmed: (b) => `Booking confirmed: ${b.serviceName} at ${b.businessName}`,
  requested: (b) => `Booking request received: ${b.serviceName} at ${b.businessName}`,
  approved: (b) => `Booking confirmed: ${b.serviceName} at ${b.businessName}`,
  declined: (b) => `Booking request declined: ${b.serviceName} at ${b.businessName}`,
  cancelled: (b) => `Booking cancelled: ${b.serviceName} at ${b.businessName}`,
};

const INTRO: Record<CustomerBookingEmailKind, string> = {
  confirmed: "Your booking is confirmed.",
  requested: "Thanks! We've received your booking request and will confirm it shortly. The time is held for you until then.",
  approved: "Good news: your booking is confirmed.",
  declined: "Sorry, we can't take this booking.",
  cancelled: "Your booking has been cancelled.",
};

// Pure: the email for one booking, so it can be tested without sending.
export function renderCustomerBookingEmail(
  kind: CustomerBookingEmailKind,
  b: BookingForEmail,
  extra: { reason?: string | null; manageUrl?: string } = {},
): { subject: string; html: string; ics: string | null } {
  const when = formatLocalDateTime(b.startsAt);
  const lines: [string, string | null][] = [
    ["Service", b.serviceName],
    ["When", when],
    ["With", b.staffName],
    ["Reference", bookingRef(b.id)],
  ];
  const active = kind === "confirmed" || kind === "requested" || kind === "approved";
  const html = `
    <p>Hi ${escapeHtml(b.name)},</p>
    <p>${escapeHtml(INTRO[kind])}</p>
    ${kind === "declined" && extra.reason ? `<p>${escapeHtml(extra.reason)}</p>` : ""}
    <p>${lines
      .filter(([, v]) => v)
      .map(([label, v]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(v!)}`)
      .join("<br />")}</p>
    ${
      active && extra.manageUrl
        ? `<p><a href="${escapeHtml(extra.manageUrl)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600">View or cancel your booking</a></p>`
        : ""
    }
    ${b.contact ? `<p>Questions? Contact ${escapeHtml(b.businessName)} on ${escapeHtml(b.contact)}.</p>` : ""}
    <p style="font-size:12px;color:#71717a">${escapeHtml(b.businessName)}</p>
  `;
  const ics =
    kind === "confirmed" || kind === "approved"
      ? bookingIcs({
          uid: b.id,
          title: `${b.serviceName} at ${b.businessName}`,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          description: `Reference ${bookingRef(b.id)}${b.staffName ? ` with ${b.staffName}` : ""}`,
        })
      : null;
  return { subject: SUBJECT[kind](b), html, ics };
}

export async function emailCustomerAboutBooking(
  admin: SupabaseClient,
  tenantId: string,
  bookingId: string,
  kind: CustomerBookingEmailKind,
  extra: { reason?: string | null } = {},
): Promise<void> {
  try {
    const [{ data: booking }, { data: config }] = await Promise.all([
      admin
        .from("bookings")
        .select("id, name, email, starts_at, ends_at, services(name), staff(name)")
        .eq("tenant_id", tenantId)
        .eq("id", bookingId)
        .maybeSingle(),
      admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (!booking?.email) return;

    const b: BookingForEmail = {
      id: booking.id,
      name: booking.name,
      email: booking.email,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      serviceName: (booking.services as unknown as { name: string } | null)?.name ?? "Appointment",
      staffName: (booking.staff as unknown as { name: string } | null)?.name ?? null,
      businessName: config?.business_name || "us",
      contact: config?.handoff_contact ?? "",
    };
    const email = renderCustomerBookingEmail(kind, b, { ...extra, manageUrl: manageBookingUrl(b.id, b.endsAt) });
    await sendCustomerEmail({
      to: booking.email,
      subject: email.subject,
      html: email.html,
      attachments: email.ics ? [{ filename: "booking.ics", content: email.ics, contentType: "text/calendar" }] : undefined,
    });
  } catch (err) {
    console.error(`Customer email (${kind}) for booking ${bookingId} failed:`, err);
  }
}
