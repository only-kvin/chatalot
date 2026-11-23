import { describe, it, expect, vi, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const emails = vi.fn(async () => undefined);
vi.mock("../lib/email/customer-booking", () => ({ emailCustomerAboutBooking: (...a: unknown[]) => emails(...(a as [])) }));
vi.mock("../lib/email/event-signup", () => ({ emailCustomerAboutSignup: (...a: unknown[]) => emails(...(a as [])) }));

import { parseCsv, parseHistory, recoverPayments } from "../lib/payments/recover";

// The header and row shape of PayFast's sandbox transaction history, as
// returned to our end-to-end test on 2026-11-23 (names replaced).
const HEADER =
  'Date,Type,Sign,Party,Name,Description,Currency,"Funding Type",Gross,Fee,Net,Balance,"M Payment ID","PF Payment ID",' +
  '"custom str1","custom int1","custom str2","custom int2","custom str3","custom str4","custom str5","custom int3","custom int4","custom int5"';
const row = (mId: string, pfId: string, gross = "10.00", type = "FUNDS_RECEIVED") =>
  `"2026-11-23 01:08:37",${type},CREDIT,"Test User","Cut, wash - Demo","Booking 9157A17C, Monday 23 November at 09:00",ZAR,WALLET,${gross},-2.30,7.70,,${mId},${pfId},,,,,,,,,,`;

const TENANT = "11111111-1111-4111-8111-111111111111";
const LOST = "9d80d1eb-9cc1-4f6d-8902-f60ae0d68101";
const OTHER = "21aea121-02b4-45ed-b7ea-947718629423";

describe("PayFast history CSV", () => {
  it("parses quoted fields with commas and quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads payments by our payment id, in cents", () => {
    expect(parseHistory(`${HEADER}\n${row(LOST, "3540215")}\n${row(OTHER, "3540217", "450.50")}`)).toEqual([
      { type: "FUNDS_RECEIVED", paymentId: LOST, providerPaymentId: "3540215", grossCents: 1000, feeCents: 230 },
      { type: "FUNDS_RECEIVED", paymentId: OTHER, providerPaymentId: "3540217", grossCents: 45050, feeCents: 230 },
    ]);
  });

  it("refuses a format it doesn't recognise rather than guessing", () => {
    expect(() => parseHistory("Date,Amount\n2026-11-23,10.00")).toThrow(/unexpected columns/);
  });
});

let encryptFn: (s: string) => string;
beforeAll(async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  encryptFn = (await import("../lib/security/crypto")).encrypt;
});

function fakeAdmin(open: { id: string; booking_id: string | null; event_signup_id?: string | null; created_at: string }[], apply: { outcome: string; reason: string | null } = { outcome: "applied", reason: null }) {
  const rpc = vi.fn(async () => ({ data: apply, error: null }));
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        gte: () => q,
        maybeSingle: async () =>
          table === "payment_accounts"
            ? {
                data: {
                  id: "acc",
                  provider: "payfast",
                  mode: "sandbox",
                  merchant_id: "10000100",
                  merchant_key_encrypted: encryptFn("46f0cd694581a"),
                  passphrase_encrypted: encryptFn("jt7NOE43FZPn"),
                  status: "active",
                },
                error: null,
              }
            : { data: null, error: null },
        then: (resolve: (v: unknown) => void) => resolve({ data: open.map((p) => ({ event_signup_id: null, ...p, amount_cents: 1000 })), error: null }),
      };
      return q;
    },
    rpc,
  };
  return { admin: client as unknown as SupabaseClient, rpc };
}

const now = new Date("2026-11-23T08:00:00Z");

describe("recoverPayments", () => {
  it("applies a payment PayFast took but never confirmed, and sends the held email", async () => {
    emails.mockClear();
    const { admin, rpc } = fakeAdmin([{ id: LOST, booking_id: "booking-1", created_at: "2026-11-22T23:05:00Z" }]);
    const days: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      const date = new URL(url).searchParams.get("date")!;
      days.push(date);
      // Created 01:05 SA time on the 23rd: only that day (and not the 24th, still to come) is asked for.
      return date === "2026-11-23" ? new Response(`${HEADER}\n${row(LOST, "3540215")}`) : new Response(null, { status: 204 });
    }) as unknown as typeof globalThis.fetch;

    const r = await recoverPayments(admin, TENANT, { now, deps: { fetch } });
    expect(days).toEqual(["2026-11-23"]);
    expect(r).toEqual({ checked: 1, recovered: ["booking-1"], problems: 0 });
    expect(rpc).toHaveBeenCalledWith("apply_payment_notification", expect.objectContaining({
      p_payment_id: LOST,
      p_provider_payment_id: "3540215",
      p_provider_status: "COMPLETE",
      p_amount_gross_cents: 1000,
      p_fee_cents: 230,
      p_mode: "sandbox",
    }));
    expect(emails).toHaveBeenCalledWith(admin, TENANT, "booking-1", "confirmed");
  });

  it("recovers a paid event sign-up and sends its email", async () => {
    emails.mockClear();
    const { admin } = fakeAdmin([{ id: LOST, booking_id: null, event_signup_id: "signup-1", created_at: "2026-11-23T06:00:00Z" }]);
    const fetch = vi.fn(async () => new Response(`${HEADER}\n${row(LOST, "9")}`)) as unknown as typeof globalThis.fetch;
    expect((await recoverPayments(admin, TENANT, { now, deps: { fetch } })).recovered).toEqual(["signup-1"]);
    expect(emails).toHaveBeenCalledWith(admin, TENANT, "signup-1");
  });

  it("leaves payments PayFast doesn't list, and counts problems the database caught", async () => {
    const { admin, rpc } = fakeAdmin([{ id: LOST, booking_id: "b1", created_at: "2026-11-23T06:00:00Z" }], { outcome: "applied", reason: "paid_after_cancel" });
    const listsOther = vi.fn(async () => new Response(`${HEADER}\n${row(OTHER, "1")}`)) as unknown as typeof fetch;
    expect(await recoverPayments(admin, TENANT, { now, deps: { fetch: listsOther } })).toEqual({ checked: 1, recovered: [], problems: 0 });
    expect(rpc).not.toHaveBeenCalled();

    const listsLost = vi.fn(async () => new Response(`${HEADER}\n${row(LOST, "2")}`)) as unknown as typeof fetch;
    expect(await recoverPayments(admin, TENANT, { now, deps: { fetch: listsLost } })).toEqual({ checked: 1, recovered: [], problems: 1 });
  });

  it("ignores rows that aren't money received", async () => {
    const { admin, rpc } = fakeAdmin([{ id: LOST, booking_id: "b1", created_at: "2026-11-23T06:00:00Z" }]);
    const refund = vi.fn(async () => new Response(`${HEADER}\n${row(LOST, "3", "-10.00", "REFUND")}`)) as unknown as typeof fetch;
    await recoverPayments(admin, TENANT, { now, deps: { fetch: refund } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does nothing, and asks PayFast nothing, without open payments", async () => {
    const { admin } = fakeAdmin([]);
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    expect(await recoverPayments(admin, TENANT, { now, deps: { fetch } })).toEqual({ checked: 0, recovered: [], problems: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
