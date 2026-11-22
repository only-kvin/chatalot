import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  apiSignature,
  buildPayfastCheckout,
  centsToRand,
  checkoutSignature,
  notificationSignatureValid,
  parseNotificationBody,
  phpUrlencode,
  pingPayfast,
  randToCents,
  resetPayfastIpCache,
  verifyPayfastNotification,
} from "../lib/payments/payfast";
import { payfastCredentialsSchema } from "../lib/payments/accounts";
import type { PaymentAccountSecrets } from "../lib/payments/types";

// Expected hashes were computed independently (Python's quote_plus + md5),
// following PayFast's PHP SDK, so these tests don't just repeat our own code.

const account: PaymentAccountSecrets = {
  provider: "payfast",
  mode: "sandbox",
  merchantId: "10000100",
  merchantKey: "46f0cd694581a",
  passphrase: "jt7NOE43FZPn",
};
const PAYMENT_ID = "3f1a2b3c-0000-4000-8000-000000000001";
const PAYFAST_IP = "144.126.193.139";
const resolve = vi.fn(async (host: string) => (host === "sandbox.payfast.co.za" ? [PAYFAST_IP] : []));

const ITN_STRING =
  "m_payment_id=3f1a2b3c-0000-4000-8000-000000000001&pf_payment_id=1089250&payment_status=COMPLETE" +
  "&item_name=Cut+%26+colour&item_description=&amount_gross=250.00&amount_fee=-6.50&amount_net=243.50" +
  "&name_first=Thandi&merchant_id=10000100";
const ITN_SIGNATURE = "9d195fac429910ad772f8203e77f7da5";
const itnBody = (sig = ITN_SIGNATURE, extra = "") => `${ITN_STRING}&signature=${sig}${extra}`;

const validFetch = (answer = "VALID") =>
  vi.fn(async () => new Response(answer, { status: 200 })) as unknown as typeof fetch;

beforeEach(() => resetPayfastIpCache());

describe("PHP-style urlencode", () => {
  it("encodes like PHP's urlencode", () => {
    expect(phpUrlencode("Thandi O'Neil & co (pty)*! ~é")).toBe("Thandi+O%27Neil+%26+co+%28pty%29%2A%21+%7E%C3%A9");
    expect(phpUrlencode("a-b_c.d")).toBe("a-b_c.d");
  });
});

describe("amounts", () => {
  it("converts without floating point", () => {
    expect(centsToRand(25000)).toBe("250.00");
    expect(centsToRand(5)).toBe("0.05");
    expect(randToCents("250.00")).toBe(25000);
    expect(randToCents("-6.5")).toBe(-650);
    expect(randToCents("0.1")).toBe(10);
    for (const bad of ["", "1e3", "250.001", "abc", "25,00"]) expect(randToCents(bad)).toBeNull();
    expect(() => centsToRand(0)).toThrow();
    expect(() => centsToRand(10.5)).toThrow();
  });
});

describe("checkout", () => {
  it("signs fields in order with the passphrase", () => {
    const fields: [string, string][] = [
      ["merchant_id", "10000100"],
      ["merchant_key", "46f0cd694581a"],
      ["return_url", "https://chatalot.vercel.app/pay/return?p=1"],
      ["name_first", "Thandi"],
      ["m_payment_id", PAYMENT_ID],
      ["amount", "250.00"],
      ["item_name", "Cut & colour"],
    ];
    expect(checkoutSignature(fields, account.passphrase)).toBe("266abbb1d4c5159763397bdc40695ed1");
  });

  it("builds the form from the database amount and leaves out empty fields", () => {
    const c = buildPayfastCheckout(account, {
      paymentId: PAYMENT_ID,
      amountCents: 25000,
      itemName: "Cut & colour",
      customer: { name: "Thandi", email: "not-an-email", phone: "+27 82 123 4567" },
      returnUrl: "https://chatalot.vercel.app/pay/return?p=1",
      cancelUrl: "https://chatalot.vercel.app/pay/cancel",
      notifyUrl: "https://chatalot.vercel.app/api/payments/payfast/notify/t1",
    });
    expect(c.action).toBe("https://sandbox.payfast.co.za/eng/process");
    const keys = c.fields.map(([k]) => k);
    expect(keys).not.toContain("email_address");
    expect(keys).not.toContain("name_last");
    expect(keys.at(-1)).toBe("signature");
    expect(Object.fromEntries(c.fields).cell_number).toBe("0821234567");
    expect(Object.fromEntries(c.fields).amount).toBe("250.00");
    const signed = c.fields.slice(0, -1);
    expect(c.fields.at(-1)?.[1]).toBe(checkoutSignature(signed, account.passphrase));
  });

  it("uses the live host for live accounts", () => {
    const c = buildPayfastCheckout({ ...account, mode: "live" }, {
      paymentId: PAYMENT_ID,
      amountCents: 100,
      itemName: "x",
      customer: { name: "A" },
      returnUrl: "https://a.co/r",
      cancelUrl: "https://a.co/c",
      notifyUrl: "https://a.co/n",
    });
    expect(c.action).toBe("https://www.payfast.co.za/eng/process");
  });
});

describe("notification signature", () => {
  it("matches PayFast's algorithm, keeping empty values", () => {
    expect(notificationSignatureValid(parseNotificationBody(itnBody()), account.passphrase)).toBe(true);
  });
  it("fails when anything is changed", () => {
    const tampered = itnBody().replace("amount_gross=250.00", "amount_gross=2.50");
    expect(notificationSignatureValid(parseNotificationBody(tampered), account.passphrase)).toBe(false);
    expect(notificationSignatureValid(parseNotificationBody(itnBody()), "another-pass")).toBe(false);
    expect(notificationSignatureValid(parseNotificationBody(ITN_STRING), account.passphrase)).toBe(false);
  });
});

describe("verifyPayfastNotification", () => {
  it("accepts a genuine notification and reports cents", async () => {
    const fetch = validFetch();
    const r = await verifyPayfastNotification(itnBody(), PAYFAST_IP, account, { fetch, resolve });
    expect(r).toEqual({
      ok: true,
      notification: { paymentId: PAYMENT_ID, providerPaymentId: "1089250", status: "COMPLETE", amountGrossCents: 25000, feeCents: 650 },
    });
    // Confirmed with PayFast using the signed string, without the passphrase.
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://sandbox.payfast.co.za/eng/query/validate");
    expect(init.body).toBe(ITN_STRING);
  });

  it("rejects a bad signature before calling PayFast", async () => {
    const fetch = validFetch();
    const r = await verifyPayfastNotification(itnBody("0".repeat(32)), PAYFAST_IP, account, { fetch, resolve });
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects another merchant's notification", async () => {
    const r = await verifyPayfastNotification(itnBody(), PAYFAST_IP, { ...account, merchantId: "10000999" }, {
      fetch: validFetch(),
      resolve,
    });
    expect(r).toEqual({ ok: false, reason: "wrong_merchant" });
  });

  it("rejects notifications from outside PayFast", async () => {
    for (const ip of ["203.0.113.9", null]) {
      const r = await verifyPayfastNotification(itnBody(), ip, account, { fetch: validFetch(), resolve });
      expect(r).toEqual({ ok: false, reason: "untrusted_source" });
    }
  });

  it("rejects what PayFast won't confirm, and reports an unreachable PayFast", async () => {
    expect(await verifyPayfastNotification(itnBody(), PAYFAST_IP, account, { fetch: validFetch("INVALID"), resolve })).toEqual({
      ok: false,
      reason: "not_confirmed",
    });
    const down = vi.fn(async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect(await verifyPayfastNotification(itnBody(), PAYFAST_IP, account, { fetch: down, resolve })).toEqual({
      ok: false,
      reason: "confirm_failed",
    });
  });

  it("rejects malformed bodies", async () => {
    const r = await verifyPayfastNotification("m_payment_id=1; drop table&amount_gross=x", PAYFAST_IP, account, {
      fetch: validFetch(),
      resolve,
    });
    expect(r).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("API ping (Test connection)", () => {
  it("signs headers sorted with the passphrase", () => {
    expect(
      apiSignature({ "merchant-id": "10000100", version: "v1", timestamp: "2026-11-22T10:00:00+0200" }, account.passphrase),
    ).toBe("f4fc0ac1712806c7e2979406b7a81475");
  });

  it("calls the sandbox ping and explains a refusal", async () => {
    const mock = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => new Response("", { status: 401 }));
    const r = await pingPayfast(account, { fetch: mock as unknown as typeof fetch, now: new Date("2026-11-22T08:00:00Z") });
    expect(r.ok).toBe(false);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://api.payfast.co.za/ping?testing=true");
    expect(init.headers.timestamp).toBe("2026-11-22T10:00:00+0200");
    expect(init.headers.signature).toBe("f4fc0ac1712806c7e2979406b7a81475");
  });
});

describe("credentials form", () => {
  it("accepts real-looking credentials and refuses risky passphrases", () => {
    const ok = { mode: "sandbox", merchantId: "10000100", merchantKey: "46f0cd694581a", passphrase: "jt7NOE43FZPn" };
    expect(payfastCredentialsSchema.safeParse(ok).success).toBe(true);
    for (const passphrase of ["short", "has space here", "amp&ersand1", "percent%20x"]) {
      expect(payfastCredentialsSchema.safeParse({ ...ok, passphrase }).success).toBe(false);
    }
    expect(payfastCredentialsSchema.safeParse({ ...ok, merchantId: "abc" }).success).toBe(false);
  });
});
