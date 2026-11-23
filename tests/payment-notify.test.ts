import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handlePayfastNotification } from "../lib/payments/notify";
import { resetPayfastIpCache } from "../lib/payments/payfast";

// The notification and signature are the ones in payfast.test.ts, computed
// independently of our code.
const TENANT = "11111111-1111-4111-8111-111111111111";
const PAYFAST_IP = "144.126.193.139";
const ITN =
  "m_payment_id=3f1a2b3c-0000-4000-8000-000000000001&pf_payment_id=1089250&payment_status=COMPLETE" +
  "&item_name=Cut+%26+colour&item_description=&amount_gross=250.00&amount_fee=-6.50&amount_net=243.50" +
  "&name_first=Thandi&merchant_id=10000100&signature=9d195fac429910ad772f8203e77f7da5";

const resolve = async (host: string) => (host === "sandbox.payfast.co.za" ? [PAYFAST_IP] : []);
const payfastSays = (answer: string) => vi.fn(async () => new Response(answer)) as unknown as typeof fetch;

let encryptFn: (s: string) => string;
beforeAll(async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  encryptFn = (await import("../lib/security/crypto")).encrypt;
});
beforeEach(() => resetPayfastIpCache());

function fakeAdmin(opts: { account?: boolean; apply?: { outcome: string; reason: string | null } | "error" }) {
  const events: Record<string, unknown>[] = [];
  const rpc = vi.fn(async () =>
    opts.apply === "error" ? { data: null, error: { message: "db down" } } : { data: opts.apply ?? { outcome: "applied", reason: null }, error: null },
  );
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (table === "payment_accounts") {
            return {
              data:
                opts.account === false
                  ? null
                  : {
                      id: "acc-1",
                      provider: "payfast",
                      mode: "sandbox",
                      merchant_id: "10000100",
                      merchant_key_encrypted: encryptFn("46f0cd694581a"),
                      passphrase_encrypted: encryptFn("jt7NOE43FZPn"),
                      status: "active",
                    },
              error: null,
            };
          }
          if (table === "payments") return { data: { booking_id: "booking-1", event_signup_id: null }, error: null };
          return { data: null, error: null };
        },
        insert: async (row: Record<string, unknown>) => (events.push(row), { error: null }),
      };
      return q;
    },
    rpc,
  };
  return { admin: client as unknown as SupabaseClient, events, rpc };
}

describe("handlePayfastNotification", () => {
  it("applies a genuine payment and reports the booking to confirm", async () => {
    const { admin, rpc } = fakeAdmin({});
    const r = await handlePayfastNotification(admin, TENANT, ITN, PAYFAST_IP, { fetch: payfastSays("VALID"), resolve });
    expect(r).toEqual({ status: 200, paid: { bookingId: "booking-1", signupId: null }, detail: "applied" });
    expect(rpc).toHaveBeenCalledWith("apply_payment_notification", {
      p_tenant_id: TENANT,
      p_payment_id: "3f1a2b3c-0000-4000-8000-000000000001",
      p_provider: "payfast",
      p_mode: "sandbox",
      p_provider_payment_id: "1089250",
      p_provider_status: "COMPLETE",
      p_amount_gross_cents: 25000,
      p_fee_cents: 650,
    });
  });

  it("sends no confirmation for duplicates or problems the database caught", async () => {
    for (const apply of [
      { outcome: "duplicate", reason: null },
      { outcome: "rejected", reason: "amount_mismatch" },
      { outcome: "applied", reason: "paid_after_cancel" },
    ]) {
      const { admin } = fakeAdmin({ apply });
      const r = await handlePayfastNotification(admin, TENANT, ITN, PAYFAST_IP, { fetch: payfastSays("VALID"), resolve });
      expect(r.status).toBe(200);
      expect(r.paid).toBeNull();
    }
  });

  it("never reaches the database with a forged or unconfirmed notification", async () => {
    const cases = [
      { body: ITN.replace("amount_gross=250.00", "amount_gross=2.50"), ip: PAYFAST_IP, answer: "VALID", reason: "bad_signature" },
      { body: ITN, ip: PAYFAST_IP, answer: "INVALID", reason: "not_confirmed" },
    ];
    for (const c of cases) {
      const { admin, rpc, events } = fakeAdmin({});
      const r = await handlePayfastNotification(admin, TENANT, c.body, c.ip, { fetch: payfastSays(c.answer), resolve });
      expect(r).toMatchObject({ status: 200, paid: null, detail: c.reason });
      expect(rpc).not.toHaveBeenCalled();
      // Logged, without linking it to a payment the sender named.
      expect(events[0]).toMatchObject({ tenant_id: TENANT, outcome: "rejected", reason: c.reason });
      expect(events[0]).not.toHaveProperty("payment_id");
    }
  });

  it("asks PayFast to retry when we can't check right now", async () => {
    const down = vi.fn(async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    const a = fakeAdmin({});
    expect((await handlePayfastNotification(a.admin, TENANT, ITN, PAYFAST_IP, { fetch: down, resolve })).status).toBe(503);
    const b = fakeAdmin({ apply: "error" });
    expect((await handlePayfastNotification(b.admin, TENANT, ITN, PAYFAST_IP, { fetch: payfastSays("VALID"), resolve })).status).toBe(503);
  });

  it("ignores notifications for a business without an account, and bad URLs", async () => {
    const { admin, rpc } = fakeAdmin({ account: false });
    expect((await handlePayfastNotification(admin, TENANT, ITN, PAYFAST_IP, { resolve })).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect((await handlePayfastNotification(admin, "not-a-uuid", ITN, PAYFAST_IP)).status).toBe(400);
  });
});
