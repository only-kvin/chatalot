import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const emails = vi.fn(async () => undefined);
vi.mock("../lib/email/event-signup", () => ({ emailCustomerAboutSignup: (...a: unknown[]) => emails(...(a as [])) }));
vi.mock("../lib/contacts/upsert", () => ({ upsertContact: async () => "contact-1" }));
const account = vi.fn(async (): Promise<{ id: string; provider: "payfast"; mode: "sandbox" } | null> => ({ id: "acc", provider: "payfast", mode: "sandbox" }));
vi.mock("../lib/features", () => ({ hasFeature: async () => true }));

import { listPublicEvents } from "../lib/events/public";
import { signUpForEvent } from "../lib/events/signup";
import * as request from "../lib/payments/request";

const NOW = new Date("2026-12-01T08:00:00Z");
const ev = (over: Record<string, unknown>) => ({
  id: "e1",
  title: "Open day",
  summary: "",
  description: "",
  starts_at: "2026-12-10T08:00:00Z",
  ends_at: null,
  location: "",
  poster_path: null,
  capacity: null,
  max_per_signup: 2,
  price_cents: null,
  signups_open: true,
  status: "published",
  ...over,
});

function listClient(rows: Record<string, unknown>[], taken: Record<string, number>) {
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    gte: () => q,
    limit: () => q,
    order: async () => ({ data: rows, error: null }),
  };
  return {
    from: () => q,
    rpc: async (_fn: string, args: { p_event_id: string }) => ({ data: taken[args.p_event_id] ?? 0 }),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.example/${p}` } }) }) },
  } as unknown as SupabaseClient;
}

describe("listPublicEvents", () => {
  it("works out spots left and why sign-ups are closed", async () => {
    const rows = [
      ev({ id: "open", capacity: 10, poster_path: "t1/p.jpg" }),
      ev({ id: "full", capacity: 4 }),
      ev({ id: "closed", signups_open: false }),
      ev({ id: "off", status: "cancelled" }),
      ev({ id: "old-off", status: "cancelled", starts_at: "2026-11-01T08:00:00Z" }),
      ev({ id: "past", starts_at: "2026-11-20T08:00:00Z" }),
    ];
    const events = await listPublicEvents(listClient(rows, { open: 3, full: 4 }), "t1", { showPast: true, now: NOW });
    const by = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(by.open).toMatchObject({ spotsLeft: 7, closed: null, posterUrl: "https://cdn.example/t1/p.jpg" });
    expect(by.full).toMatchObject({ spotsLeft: 0, closed: "sold_out" });
    expect(by.closed.closed).toBe("signups_closed");
    expect(by.off.closed).toBe("cancelled");
    expect(by.past.closed).toBe("past");
    // A cancelled event that's already happened isn't shown; past events come after upcoming ones.
    expect(events.map((e) => e.id)).toEqual(["open", "full", "closed", "off", "past"]);
  });
});

type RpcReply = Record<string, unknown>;

function signupClient(reply: RpcReply, opts: { price?: number | null; paymentInsertFails?: boolean } = {}) {
  const writes: { table: string; values: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async () => ({ data: reply, error: null })),
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: table === "events" ? { price_cents: opts.price ?? null } : null, error: null }),
        insert: (values: Record<string, unknown>) => {
          writes.push({ table, values });
          return { select: () => ({ single: async () => (opts.paymentInsertFails ? { data: null, error: { message: "x" } } : { data: { id: "pay-1" }, error: null }) }) };
        },
        update: (values: Record<string, unknown>) => {
          writes.push({ table, values });
          const u = { eq: () => u, then: (r: (v: unknown) => void) => r({ error: null }) };
          return u;
        },
      };
      return q;
    },
  };
  return { admin: client as unknown as SupabaseClient, writes, rpc: client.rpc };
}

const input = {
  tenantId: "t1",
  eventId: "e1",
  widgetId: null,
  quantity: 2,
  customer: { name: "Thandi", phone: "0821234567", email: "t@example.com" },
  details: {},
  idempotencyKey: "key-12345678",
};

describe("signUpForEvent", () => {
  beforeEach(() => {
    emails.mockClear();
    vi.spyOn(request, "onlinePaymentAccount").mockImplementation(() => account());
  });

  it("confirms and emails a free sign-up", async () => {
    const { admin, rpc } = signupClient({ ok: true, repeat: false, signup_id: "s1", payment_status: "not_required", amount_due_cents: null, payment_due_at: null, left: 3 });
    const r = await signUpForEvent(admin, input);
    expect(r).toEqual({ ok: true, signupId: "s1", repeat: false, payment: null, payAtEvent: false, spotsLeft: 3 });
    expect(rpc).toHaveBeenCalledWith("create_event_signup", expect.objectContaining({ p_quantity: 2, p_take_payment: true, p_contact_id: "contact-1" }));
    expect(emails).toHaveBeenCalledWith(admin, "t1", "s1");
  });

  it("gives a paid sign-up a pay link and waits for payment before emailing", async () => {
    const { admin, writes } = signupClient(
      { ok: true, repeat: false, signup_id: "s1", payment_status: "awaiting", amount_due_cents: 30000, payment_due_at: "2026-12-01T08:30:00Z" },
      { price: 15000 },
    );
    const r = await signUpForEvent(admin, input);
    expect(r).toMatchObject({ ok: true, payment: { paymentId: "pay-1", amountCents: 30000 }, payAtEvent: false });
    expect(writes[0]).toMatchObject({ table: "payments", values: { event_signup_id: "s1", amount_cents: 30000, mode: "sandbox" } });
    expect(emails).not.toHaveBeenCalled();
  });

  it("keeps the spot as pay-at-the-event when the payment can't be created", async () => {
    const { admin, writes } = signupClient(
      { ok: true, repeat: false, signup_id: "s1", payment_status: "awaiting", amount_due_cents: 30000, payment_due_at: "2026-12-01T08:30:00Z" },
      { price: 15000, paymentInsertFails: true },
    );
    const r = await signUpForEvent(admin, input);
    expect(r).toMatchObject({ ok: true, payment: null, payAtEvent: true });
    expect(writes.at(-1)).toMatchObject({ table: "event_signups", values: { payment_status: "not_required" } });
    expect(emails).toHaveBeenCalled();
  });

  it("says pay at the event when the business can't take payments online", async () => {
    account.mockResolvedValueOnce(null);
    const { admin, rpc } = signupClient({ ok: true, repeat: false, signup_id: "s1", payment_status: "not_required" }, { price: 15000 });
    expect(await signUpForEvent(admin, input)).toMatchObject({ ok: true, payment: null, payAtEvent: true });
    expect(rpc).toHaveBeenCalledWith("create_event_signup", expect.objectContaining({ p_take_payment: false }));
  });

  it("passes on why a sign-up was refused", async () => {
    const { admin } = signupClient({ ok: false, reason: "sold_out", left: 1 });
    expect(await signUpForEvent(admin, input)).toEqual({ ok: false, reason: "sold_out", spotsLeft: 1, max: undefined });
    expect(emails).not.toHaveBeenCalled();
  });
});
