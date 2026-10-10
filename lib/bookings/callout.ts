import type { BookingLocation } from "./price-label";

// Call-out rules that don't need the database, so tests cover them directly.

export type CustomerAddress = {
  line: string;
  suburb: string;
  city?: string | null;
  postalCode?: string | null;
  accessNotes?: string | null;
};

// A customer booking needs at least a street address and a suburb; a
// booking at the business needs nothing extra. Returns the problem, or null.
export function addressProblem(location: BookingLocation, address: CustomerAddress | null | undefined): string | null {
  if (location === "business") return null;
  if (!address?.line?.trim()) return "Please give the street address.";
  if (!address.suburb?.trim()) return "Please give the suburb or town.";
  return null;
}

// Whether a customer's booking waits for the owner. The team's own
// bookings never do. Call-outs wait unless the owner confirms them
// instantly, and one outside the listed area always waits.
export function needsApproval(p: {
  forTeam: boolean;
  location: BookingLocation;
  outsideArea: boolean;
  bookingsNeedApproval: boolean;
  calloutsConfirmInstantly: boolean;
}): boolean {
  if (p.forTeam) return false;
  if (p.location === "customer") return p.outsideArea || !p.calloutsConfirmInstantly;
  return p.bookingsNeedApproval;
}
