// Checks our PayFast code against the real sandbox with YOUR sandbox
// account, without touching the database. Prints no secrets.
//
// Usage: pnpm payfast-sandbox-check
//
// Needs in .env.local (from sandbox.payfast.co.za):
//   PAYFAST_SANDBOX_MERCHANT_ID, PAYFAST_SANDBOX_MERCHANT_KEY, PAYFAST_SANDBOX_PASSPHRASE
//
// 1. API ping with the right passphrase (should pass) and a wrong one (should
//    be refused): proves our API signature and the error handling.
// 2. Posts a signed test checkout to the sandbox and reports whether PayFast
//    accepted the signature: proves our checkout signature and merchant key.

import { randomUUID } from "node:crypto";
import { payfastCredentialsSchema } from "../lib/payments/accounts";
import { buildPayfastCheckout, pingPayfast } from "../lib/payments/payfast";

async function main() {
  const parsed = payfastCredentialsSchema.safeParse({
    mode: "sandbox",
    merchantId: process.env.PAYFAST_SANDBOX_MERCHANT_ID ?? "",
    merchantKey: process.env.PAYFAST_SANDBOX_MERCHANT_KEY ?? "",
    passphrase: process.env.PAYFAST_SANDBOX_PASSPHRASE ?? "",
  });
  if (!parsed.success) {
    console.error("Sandbox details missing or invalid in .env.local:", parsed.error.issues[0]?.message);
    process.exit(1);
  }
  const account = { provider: "payfast" as const, ...parsed.data };

  const good = await pingPayfast(account);
  console.log("1a. ping, real passphrase:", good.ok ? "OK" : `FAILED: ${good.error}`);
  const bad = await pingPayfast({ ...account, passphrase: "definitely-wrong-123" });
  console.log("1b. ping, wrong passphrase:", bad.ok ? "UNEXPECTEDLY ACCEPTED" : `refused as expected (${bad.error})`);

  const checkout = buildPayfastCheckout(account, {
    paymentId: randomUUID(),
    amountCents: 1000,
    itemName: "Bookfront sandbox check",
    customer: { name: "Test Customer", email: "sbtu01@payfast.io" },
    returnUrl: "https://example.com/return",
    cancelUrl: "https://example.com/cancel",
    notifyUrl: "https://example.com/notify",
  });
  const res = await fetch(checkout.action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(checkout.fields).toString(),
    redirect: "manual",
  });
  const text = res.status >= 300 && res.status < 400 ? "" : await res.text();
  const signatureRejected = /signature/i.test(text) && /(mismatch|invalid|incorrect)/i.test(text);
  console.log(
    "2.  checkout:",
    signatureRejected
      ? "PayFast REJECTED the signature"
      : `accepted (HTTP ${res.status}${res.headers.get("location") ? ` -> ${res.headers.get("location")}` : ""})`,
  );
  if (signatureRejected || !good.ok || bad.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
