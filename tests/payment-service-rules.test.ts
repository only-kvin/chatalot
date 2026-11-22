import { describe, it, expect } from "vitest";
import { amountDueCents, paymentModeLabel, servicePaymentProblem, type ServicePaymentInput } from "../lib/payments/service-rules";

const fixed: ServicePaymentInput = { paymentMode: "none", depositCents: null, priceCents: 25000, priceType: "fixed" };

describe("service payment rules", () => {
  it("charges nothing when payment is off", () => {
    expect(servicePaymentProblem(fixed)).toBeNull();
    expect(amountDueCents(fixed)).toBeNull();
  });

  it("charges the full fixed price", () => {
    expect(amountDueCents({ ...fixed, paymentMode: "full" })).toBe(25000);
  });

  it("needs a fixed price for full payment", () => {
    for (const s of [
      { ...fixed, paymentMode: "full" as const, priceType: "from" as const },
      { ...fixed, paymentMode: "full" as const, priceType: "on_inspection" as const, priceCents: null },
      { ...fixed, paymentMode: "full" as const, priceCents: null },
    ]) {
      expect(servicePaymentProblem(s)).toMatch(/fixed price/);
      expect(amountDueCents(s)).toBeNull();
    }
  });

  it("takes a deposit, even for quoted work, but never more than a fixed price", () => {
    expect(amountDueCents({ ...fixed, paymentMode: "deposit", depositCents: 10000 })).toBe(10000);
    expect(amountDueCents({ ...fixed, paymentMode: "deposit", depositCents: 50000, priceType: "on_inspection", priceCents: null })).toBe(50000);
    expect(servicePaymentProblem({ ...fixed, paymentMode: "deposit", depositCents: 30000 })).toMatch(/more than the price/);
    expect(servicePaymentProblem({ ...fixed, paymentMode: "deposit", depositCents: null })).toMatch(/Enter the deposit/);
  });

  it("labels services in the list", () => {
    expect(paymentModeLabel({ paymentMode: "full", depositCents: null })).toBe("Paid online");
    expect(paymentModeLabel({ paymentMode: "deposit", depositCents: 10000 })).toBe("R100 deposit online");
    expect(paymentModeLabel({ paymentMode: "deposit", depositCents: 12550 })).toBe("R125.50 deposit online");
    expect(paymentModeLabel({ paymentMode: "none", depositCents: null })).toBeNull();
  });
});
