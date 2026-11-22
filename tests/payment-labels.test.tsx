import { describe, it, expect, vi } from "vitest";

// The refund button refreshes the page through the app router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { paymentBadge } from "../lib/payments/labels";
import { describeEvent } from "../lib/bookings/labels";
import { PaymentCard, type PaymentAttempt } from "../app/(dashboard)/dashboard/bookings/[id]/payment-card";

describe("payment badge", () => {
  it("labels each payment state, and nothing for bookings without online payment", () => {
    expect(paymentBadge("awaiting", 10000)).toEqual({ label: "Awaiting payment R100", variant: "warning" });
    expect(paymentBadge("paid", 12550)).toEqual({ label: "Paid R125.50", variant: "success" });
    expect(paymentBadge("expired", 10000)).toEqual({ label: "Not paid", variant: "outline" });
    expect(paymentBadge("refunded", 10000)?.label).toBe("Refunded");
    expect(paymentBadge("not_required", null)).toBeNull();
    expect(paymentBadge(undefined, null)).toBeNull();
  });
});

describe("booking history wording", () => {
  const event = (type: string, details: Record<string, unknown> = {}) => ({
    type,
    actor: "system",
    channel: null,
    details,
    created_by: null,
    created_at: "2026-11-23T08:00:00Z",
  });
  it("describes payment events", () => {
    expect(describeEvent(event("payment_received", { amount_cents: 1000 }))).toBe("Customer paid R10 online");
    expect(describeEvent(event("payment_expired"))).toBe("Not paid in time, so the slot was released");
  });
});

const attempt = (over: Partial<PaymentAttempt>): PaymentAttempt => ({
  id: "21aea121-02b4-45ed-b7ea-947718629423",
  status: "created",
  mode: "live",
  amount_cents: 1000,
  fee_cents: null,
  net_cents: null,
  provider_payment_id: null,
  paid_at: null,
  created_at: "2026-11-23T08:00:00Z",
  ...over,
});

describe("payment card", () => {
  it("shows nothing for bookings without online payment", () => {
    expect(renderToStaticMarkup(<PaymentCard bookingId="b1" isOwner={false} status="not_required" amountDueCents={null} dueAt={null} attempts={[]} />)).toBe("");
  });

  it("while waiting: the deadline and the pay link to resend", () => {
    const html = renderToStaticMarkup(
      <PaymentCard bookingId="b1" isOwner={false} status="awaiting" amountDueCents={1000} dueAt="2026-11-23T08:30:00Z" attempts={[attempt({})]} />,
    );
    expect(html).toContain("Waiting for the customer to pay R10 online");
    expect(html).toContain("until 10:30");
    expect(html).toContain("/pay/21aea121-02b4-45ed-b7ea-947718629423");
  });

  it("once paid: fee, what they receive, PayFast's reference, test mode", () => {
    const html = renderToStaticMarkup(
      <PaymentCard
        bookingId="b1"
        isOwner={false}
        status="paid"
        amountDueCents={1000}
        dueAt={null}
        attempts={[attempt({ status: "paid", mode: "sandbox", fee_cents: 230, net_cents: 770, provider_payment_id: "3540217", paid_at: "2026-11-23T08:10:00Z" }), attempt({ id: "x", status: "cancelled" })]}
      />,
    );
    expect(html).toContain("Paid R10 online");
    expect(html).toContain("fee R2.30, so you receive R7.70");
    expect(html).toContain("PayFast reference 3540217");
    expect(html).toContain("Test mode");
    expect(html).toContain("Payment attempts (2)");
    expect(html).not.toContain("/pay/");
    // Only owners get the refund button.
    expect(html).not.toContain("Mark as refunded");
  });

  it("offers the owner Mark as refunded once paid, and shows a refund", () => {
    const paid = attempt({ status: "paid", fee_cents: 230, net_cents: 770, provider_payment_id: "3540217", paid_at: "2026-11-23T08:10:00Z" });
    const owner = renderToStaticMarkup(<PaymentCard bookingId="b1" isOwner status="paid" amountDueCents={1000} dueAt={null} attempts={[paid]} />);
    expect(owner).toContain("Mark as refunded");
    const refunded = renderToStaticMarkup(
      <PaymentCard bookingId="b1" isOwner status="refunded" amountDueCents={1000} dueAt={null} attempts={[{ ...paid, status: "refunded" }]} />,
    );
    expect(refunded).toContain("Refunded to the customer in PayFast");
    expect(refunded).toContain("PayFast reference 3540217");
    expect(refunded).not.toContain("Mark as refunded");
  });
});
