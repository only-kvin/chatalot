import { createAdminClient } from "@/lib/db/supabase-admin";
import { ACTIVE_STATUSES, insideCutoff } from "@/lib/bookings/manage";
import { readBookingToken } from "@/lib/security/signed-token";
import { BOOKING_PLACE_COLUMNS, customerPlaceLines, type BookingPlace } from "@/lib/bookings/place";

// The booking behind a signed "manage your booking" link. The token is the
// customer's only credential, so everything is looked up from it alone.
export async function loadBookingFromToken(token: string) {
  const bookingId = readBookingToken(decodeURIComponent(token));
  if (!bookingId) return null;

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(`id, tenant_id, service_id, staff_id, name, starts_at, ends_at, status, ${BOOKING_PLACE_COLUMNS}, services(name), staff(name)`)
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const [{ data: config }, { data: tenant }] = await Promise.all([
    admin
      .from("agent_configs")
      .select("business_name, handoff_contact, booking_change_cutoff_minutes, business_address, cancellation_policy")
      .eq("tenant_id", booking.tenant_id)
      .maybeSingle(),
    admin.from("tenants").select("public_widget_key, status").eq("id", booking.tenant_id).maybeSingle(),
  ]);

  const active = ACTIVE_STATUSES.includes(booking.status) && new Date(booking.starts_at) > new Date();
  return {
    id: booking.id,
    tenantId: booking.tenant_id,
    // Public anyway (it's in every widget snippet); the reschedule picker
    // on the manage page uses it to read availability.
    publicKey: tenant?.status === "active" ? (tenant.public_widget_key as string) : null,
    serviceId: booking.service_id,
    staffId: booking.staff_id as string | null,
    endsAt: booking.ends_at,
    name: booking.name,
    startsAt: booking.starts_at,
    status: booking.status,
    serviceName: (booking.services as unknown as { name: string } | null)?.name ?? "Appointment",
    staffName: (booking.staff as unknown as { name: string } | null)?.name ?? null,
    businessName: config?.business_name || "the business",
    contact: config?.handoff_contact ?? "",
    windowEnd: booking.arrival_window_end as string | null,
    // Where, the agreed call-out fee and the cancellation policy.
    placeLines: customerPlaceLines(booking as BookingPlace, {
      businessName: config?.business_name || "the business",
      businessAddress: config?.business_address ?? "",
      cancellationPolicy: config?.cancellation_policy ?? "",
    }),
    active,
    // Too close to the appointment to cancel online.
    tooLate: active && insideCutoff(booking.starts_at, config?.booking_change_cutoff_minutes ?? 120),
  };
}
