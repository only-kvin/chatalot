import { calloutFeeNotice } from "./price-label";

// Where a booking happens and what the customer agreed to, written out the
// same way in confirmation emails, reminders, the manage page (/b/<token>)
// and the customer page (/c/<token>).

// The booking columns these helpers read.
export const BOOKING_PLACE_COLUMNS =
  "location, address_line, suburb, city, postal_code, access_notes, arrival_window_end, callout_fee_cents, outside_service_area";

export type BookingPlace = {
  location: string;
  address_line: string | null;
  suburb: string | null;
  city: string | null;
  postal_code: string | null;
  access_notes?: string | null;
  arrival_window_end: string | null;
  callout_fee_cents: number | null;
  outside_service_area?: boolean;
};

export type BusinessPlace = { businessName: string; businessAddress: string; cancellationPolicy: string };

// "12 Oak Street, Sandton, Johannesburg, 2196", or null at the business.
export function addressText(b: BookingPlace): string | null {
  if (b.location !== "customer") return null;
  return [b.address_line, b.suburb, b.city, b.postal_code].filter((p) => p?.trim()).join(", ") || null;
}

// A plain Google Maps search for the address: no API key, no cost.
export function mapsUrl(b: BookingPlace): string | null {
  const address = addressText(b);
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

// Label/value lines for the customer: where, the agreed call-out fee and
// the cancellation policy. Null values are skipped by every caller.
export function customerPlaceLines(b: BookingPlace, biz: BusinessPlace): [string, string | null][] {
  const atCustomer = b.location === "customer";
  return [
    ["Where", atCustomer ? addressText(b) : biz.businessAddress.trim() || null],
    ["Payment", atCustomer ? calloutFeeNotice(b.callout_fee_cents, biz.businessName) : null],
    ["Cancellation policy", biz.cancellationPolicy.trim() || null],
  ];
}
