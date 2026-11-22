import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expireUnpaidHolds, requestPaymentForBooking } from "../lib/payments/request";

// A stand-in Supabase client: each table answers reads with a fixed row and
// records the updates and inserts made to it.
type Writes = { table: string; kind: "update" | "insert"; values: Record<string, unknown>; filters: string[] }[];

function fakeAdmin(rows: {
  service?: Record<string, unknown> | null;
  account?: Record<string, unknown> | null;
  holdSucceeds?: boolean;
  insertFails?: boolean;
}) {
  const writes: Writes = [];
  const reads: Record<string, unknown> = {
    services: rows.service ?? null,
    payment_accounts: rows.account ?? null,
    agent_configs: { payment_window_minutes: 30 },
  };
  const client = {
    from(table: string) {
      const filters: string[] = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push(`${c}=${v}`), q),
        maybeSingle: async () => ({ data: reads[table] ?? null, error: null }),
        update(values: Record<string, unknown>) {
          const w = { table, kind: "update" as const, values, filters };
          writes.push(w);
          const u = {
            eq: (c: string, v: unknown) => (filters.push(`${c}=${v}`), u),
            select: () => u,
            maybeSingle: async () => ({ data: rows.holdSucceeds === false ? null : { id: "b1" }, error: null }),
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          };
          return u;
        },
        insert(values: Record<string, unknown>) {
          writes.push({ table, kind: "insert", values, filters });
          const i = {
            select: () => i,
            single: async () =>
              rows.insertFails ? { data: null, error: { message: "boom" } } : { data: { id: "pay-1" }, error: null },
          };
          return i;
        },
      };
      return q;
    },
    rpc: async () => ({ error: { code: "42501", message: "permission denied" } }),
  };
  return { admin: client as unknown as SupabaseClient, writes };
}

const activeAccount = { id: "acc-1", provider: "payfast", mode: "sandbox", status: "active" };
const fullService = { payment_mode: "full", deposit_cents: null, price_cents: 25000, price_type: "fixed" };
const booking = { tenantId: "t1", bookingId: "b1", serviceId: "s1", now: new Date("2026-11-23T08:00:00Z") };

describe("requestPaymentForBooking", () => {
  it("holds the booking and creates a payment for the stored amount", async () => {
    const { admin, writes } = fakeAdmin({ service: fullService, account: activeAccount });
    const r = await requestPaymentForBooking(admin, booking);
    expect(r).toMatchObject({ paymentId: "pay-1", amountCents: 25000, dueAt: "2026-11-23T08:30:00.000Z" });
    expect(r?.url).toMatch(/\/pay\/pay-1$/);

    const hold = writes.find((w) => w.table === "bookings")!;
    expect(hold.values).toMatchObject({ payment_status: "awaiting", amount_due_cents: 25000 });
    // Only a booking that isn't already on hold, in this business.
    expect(hold.filters).toEqual(expect.arrayContaining(["tenant_id=t1", "id=b1", "payment_status=not_required"]));
    expect(writes.find((w) => w.table === "payments")?.values).toMatchObject({
      tenant_id: "t1",
      booking_id: "b1",
      provider: "payfast",
      mode: "sandbox",
      amount_cents: 25000,
    });
  });

  it("takes the deposit for deposit services", async () => {
    const { admin } = fakeAdmin({
      service: { payment_mode: "deposit", deposit_cents: 10000, price_cents: null, price_type: "on_inspection" },
      account: activeAccount,
    });
    expect((await requestPaymentForBooking(admin, booking))?.amountCents).toBe(10000);
  });

  it("asks for nothing without an active account or a payment setting", async () => {
    for (const rows of [
      { service: fullService, account: null },
      { service: fullService, account: { ...activeAccount, status: "unverified" } },
      { service: fullService, account: { ...activeAccount, status: "disabled" } },
      { service: { ...fullService, payment_mode: "none" }, account: activeAccount },
      // Out of step with the rules (e.g. price changed to "from"): no charge.
      { service: { ...fullService, price_type: "from" }, account: activeAccount },
    ]) {
      const { admin, writes } = fakeAdmin(rows);
      expect(await requestPaymentForBooking(admin, booking)).toBeNull();
      expect(writes).toEqual([]);
    }
  });

  it("doesn't create a payment when the booking couldn't be held", async () => {
    const { admin, writes } = fakeAdmin({ service: fullService, account: activeAccount, holdSucceeds: false });
    expect(await requestPaymentForBooking(admin, booking)).toBeNull();
    expect(writes.some((w) => w.table === "payments")).toBe(false);
  });

  it("releases the hold if the payment can't be created", async () => {
    const { admin, writes } = fakeAdmin({ service: fullService, account: activeAccount, insertFails: true });
    expect(await requestPaymentForBooking(admin, booking)).toBeNull();
    const updates = writes.filter((w) => w.table === "bookings");
    expect(updates.at(-1)?.values).toMatchObject({ payment_status: "not_required", payment_due_at: null });
  });
});

describe("expireUnpaidHolds", () => {
  it("quietly skips when the client isn't allowed (signed-in dashboard)", async () => {
    const { admin } = fakeAdmin({});
    await expect(expireUnpaidHolds(admin, "t1")).resolves.toBeUndefined();
  });
});
