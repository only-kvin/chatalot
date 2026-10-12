import type { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { createBooking, type BookingFailure, type CreatedBooking } from "@/lib/bookings/create";
import { upsertContact } from "@/lib/contacts/upsert";
import { emailCustomerAboutBooking } from "@/lib/email/customer-booking";
import { notifyStaffAboutBooking } from "@/lib/email/notify-staff";
import { notifyOwnerOfBooking } from "@/lib/email/notify-booking";
import { formatBookingWhen } from "@/lib/bookings/labels";
import type { CustomerAddress } from "@/lib/bookings/callout";
import type { BookingLocation } from "@/lib/bookings/price-label";
import type { Answers } from "./fields";

// A booking made by a customer through a website widget. The answers have
// already been validated against the business's stored form fields. The
// customer ticked the consent box, so their details are saved as a contact.

export async function bookFromWidget(
  admin: SupabaseClient,
  b: {
    tenantId: string;
    serviceId: string;
    staffId: string | null;
    date: string;
    time: string;
    answers: Answers;
    idempotencyKey: string;
    widget: "schedule" | "appointment";
    location?: BookingLocation | null;
    address?: CustomerAddress | null;
  },
): Promise<CreatedBooking | BookingFailure> {
  const { answers } = b;
  const contactId = await upsertContact(admin, {
    tenantId: b.tenantId,
    name: answers.name,
    phone: answers.phone,
    email: answers.email,
    nameSource: "customer",
    channel: "web",
    consent: true,
  }).catch((err) => {
    console.error("Saving the widget customer failed:", err);
    return null;
  });

  const booked = await createBooking(admin, {
    tenantId: b.tenantId,
    serviceId: b.serviceId,
    staffId: b.staffId,
    date: b.date,
    time: b.time,
    customer: { name: answers.name, phone: answers.phone, email: answers.email, contactId },
    conversationId: null,
    source: "widget",
    notes: answers.notes,
    details: answers.details,
    idempotencyKey: b.idempotencyKey,
    lead: { source: `${b.widget}_widget`, summary: `Booked on the website for ${b.date} at ${b.time}` },
    actor: "customer",
    channel: "web",
    location: b.location,
    address: b.address,
  });
  if (!booked.ok || booked.repeat) return booked;

  // The customer sees their confirmation now; the alert and emails go out
  // after the response (they took ~5s inline).
  waitUntil(notify(admin, b, booked));
  return booked;
}

async function notify(
  admin: SupabaseClient,
  b: { tenantId: string; answers: Answers; address?: CustomerAddress | null },
  booked: CreatedBooking,
): Promise<void> {
  const { answers } = b;
  const [{ data: config }, { data: staff }] = await Promise.all([
    admin.from("agent_configs").select("business_name").eq("tenant_id", b.tenantId).maybeSingle(),
    booked.staffId
      ? admin.from("staff").select("name").eq("tenant_id", b.tenantId).eq("id", booked.staffId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const pending = booked.status === "pending";
  await Promise.all([
    notifyOwnerOfBooking(admin, b.tenantId, config?.business_name ?? "", {
      name: answers.name,
      phone: answers.phone,
      email: answers.email,
      serviceName: booked.serviceName,
      startsAtLabel: formatBookingWhen(booked.startsAt, booked.windowEnd),
      address: booked.location === "customer" && b.address ? `${b.address.line}, ${b.address.suburb}` : null,
      outsideArea: booked.outsideArea,
      staffName: staff?.name ?? null,
      viaWidget: true,
      pending,
      bookingId: booked.bookingId,
    }),
    emailCustomerAboutBooking(admin, b.tenantId, booked.bookingId, pending ? "requested" : "confirmed"),
    notifyStaffAboutBooking(admin, b.tenantId, booked.bookingId, "new"),
  ]);
}
