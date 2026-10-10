// Customer-facing price and call-out wording: the one source for the AI,
// the widgets, emails and the booking pages. Pure and dependency-free, so
// the widget bundle can import it too. Re-exported from labels.ts.

export type PriceType = "fixed" | "from" | "on_inspection";
export type ServiceLocation = "business" | "customer" | "either";
export type BookingLocation = "business" | "customer";

export function formatRand(cents: number): string {
  return `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export type PricedService = {
  priceType: PriceType;
  priceCents: number | null;
  calloutFeeCents: number | null;
};

// "R350", "from R350", "Quoted on site", plus " · call-out fee R450" when
// it happens at the customer and has a fee. Null when there's nothing to say.
export function priceLabel(s: PricedService, atCustomer: boolean): string | null {
  let base: string | null;
  if (s.priceType === "on_inspection") base = "Quoted on site";
  else if (s.priceCents === null) base = null;
  else base = s.priceType === "from" ? `from ${formatRand(s.priceCents)}` : formatRand(s.priceCents);

  const fee = atCustomer && s.calloutFeeCents ? `call-out fee ${formatRand(s.calloutFeeCents)}` : null;
  if (!base) return fee ? fee.charAt(0).toUpperCase() + fee.slice(1) : null;
  return fee ? `${base} · ${fee}` : base;
}

// "Call-out fee R450, payable to Pipe Pros on arrival": shown before a
// call-out is booked and in every confirmation. Null without a fee.
export function calloutFeeNotice(feeCents: number | null, businessName: string): string | null {
  if (!feeCents) return null;
  return `Call-out fee ${formatRand(feeCents)}, payable to ${businessName || "the business"} on arrival`;
}

// "08:00–10:00" for a window, "08:00" for an exact time.
export function timeRangeLabel(start: string, end: string | null | undefined): string {
  return end ? `${start}–${end}` : start;
}

// Where a booking for this service happens, or null when the choice doesn't
// suit the service. "either" without a choice means at the business.
export function resolveBookingLocation(
  service: ServiceLocation,
  requested: BookingLocation | null | undefined,
): BookingLocation | null {
  if (service === "either") return requested ?? "business";
  if (requested && requested !== service) return null;
  return service;
}
