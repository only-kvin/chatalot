// What a service may ask customers to pay online. The same rules as
// services_payment_check in the database, with messages a business owner can
// act on. Shared by the services editor (live hint) and its server action.

export type ServicePaymentMode = "none" | "deposit" | "full";

export type ServicePaymentInput = {
  paymentMode: ServicePaymentMode;
  depositCents: number | null;
  priceCents: number | null;
  priceType: "fixed" | "from" | "on_inspection";
};

export function servicePaymentProblem(s: ServicePaymentInput): string | null {
  if (s.paymentMode === "deposit") {
    if (!s.depositCents || s.depositCents <= 0) return "Enter the deposit customers pay online.";
    if (s.priceType === "fixed" && s.priceCents !== null && s.depositCents > s.priceCents) {
      return "The deposit can't be more than the price.";
    }
  }
  if (s.paymentMode === "full" && (s.priceType !== "fixed" || !s.priceCents)) {
    return 'Full payment online needs a fixed price. Use a deposit for "from" or quoted prices.';
  }
  return null;
}

// What the customer pays online for a booking of this service, or null.
export function amountDueCents(s: ServicePaymentInput): number | null {
  if (servicePaymentProblem(s)) return null;
  if (s.paymentMode === "deposit") return s.depositCents;
  if (s.paymentMode === "full") return s.priceCents;
  return null;
}

export function paymentModeLabel(s: Pick<ServicePaymentInput, "paymentMode" | "depositCents">): string | null {
  if (s.paymentMode === "full") return "Paid online";
  if (s.paymentMode === "deposit" && s.depositCents) return `R${(s.depositCents / 100).toFixed(2).replace(/\.00$/, "")} deposit online`;
  return null;
}
