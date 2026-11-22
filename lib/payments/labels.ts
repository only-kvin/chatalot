import { formatRand } from "@/lib/bookings/price-label";

// How a booking's online payment reads in the dashboard: one badge, the same
// on the list, the day view and the booking page.

export type BookingPaymentStatus = "not_required" | "awaiting" | "paid" | "expired" | "refunded";

export type PaymentBadge = { label: string; variant: "warning" | "success" | "outline" | "secondary" };

export function paymentBadge(status: string | null | undefined, amountCents: number | null | undefined): PaymentBadge | null {
  const amount = amountCents ? ` ${formatRand(amountCents)}` : "";
  switch (status as BookingPaymentStatus) {
    case "awaiting":
      return { label: `Awaiting payment${amount}`, variant: "warning" };
    case "paid":
      return { label: `Paid${amount}`, variant: "success" };
    case "expired":
      return { label: "Not paid", variant: "outline" };
    case "refunded":
      return { label: "Refunded", variant: "secondary" };
    default:
      return null;
  }
}

export const PAYMENT_ATTEMPT_LABEL: Record<string, string> = {
  created: "Started, not paid",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Not completed",
  refunded: "Refunded",
};
