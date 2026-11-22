// Payment gateways a business can connect ("bring your own gateway"). Each
// gateway implements the same small surface so the booking flow, notify
// route and dashboard never know which one they're talking to. Only PayFast
// exists today; Yoco/Ozow/Paystack would be new files beside payfast.ts.

export type PaymentProviderId = "payfast";
export type PaymentMode = "sandbox" | "live";

// A business's gateway account, decrypted. Server-only: never send to a browser.
export type PaymentAccountSecrets = {
  provider: PaymentProviderId;
  mode: PaymentMode;
  merchantId: string;
  merchantKey: string;
  passphrase: string;
};

export type CheckoutRequest = {
  // payments.id — PayFast's m_payment_id. Our only key back to the payment.
  paymentId: string;
  amountCents: number;
  itemName: string;
  itemDescription?: string;
  customer: { name: string; email?: string | null; phone?: string | null };
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

// What the customer's browser POSTs to the gateway: the page renders these as
// hidden inputs, in this order, and submits them.
export type Checkout = { action: string; fields: [string, string][] };

// A notification that passed every check, reduced to what the database needs.
export type VerifiedNotification = {
  paymentId: string;
  providerPaymentId: string;
  // COMPLETE | FAILED | CANCELLED (anything else is ignored by the database).
  status: string;
  amountGrossCents: number;
  feeCents: number | null;
};

export type NotificationFailure = {
  ok: false;
  reason:
    | "malformed"
    | "bad_signature"
    | "wrong_merchant"
    | "not_confirmed"
    | "confirm_failed";
};
