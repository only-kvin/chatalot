import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFeatures } from "../lib/plans";

const sent = vi.fn(async (_e: { to: string; subject: string; html: string }) => undefined);
vi.mock("../lib/email/send", async (orig) => ({
  ...(await orig<typeof import("../lib/email/send")>()),
  sendCustomerEmail: (e: { to: string; subject: string; html: string }) => sent(e),
}));

import { dayWord, reminderEmail, sendEventReminders } from "../lib/events/reminders";

// 08:00 SA on Tuesday 1 December 2026.
const NOW = new Date("2026-12-01T06:00:00Z");

describe("dayWord", () => {
  it("says today, tomorrow or the weekday, in SA time", () => {
    expect(dayWord("2026-12-01T16:00:00Z", NOW)).toBe("today");
    expect(dayWord("2026-12-02T16:00:00Z", NOW)).toBe("tomorrow");
    // 23:30 UTC on the 1st is 01:30 on the 2nd in SA: tomorrow.
    expect(dayWord("2026-12-01T23:30:00Z", NOW)).toBe("tomorrow");
    expect(dayWord("2026-12-03T08:00:00Z", NOW)).toBe("on Thursday");
  });
});

describe("reminderEmail", () => {
  const base = {
    name: "Thandi",
    businessName: "The Courtyard",
    contact: "011 555 0100",
    title: "Wine night",
    startsAt: "2026-12-02T16:00:00Z",
    location: "12 Main Rd",
    quantity: 2,
    payAtEventCents: null,
    now: NOW,
  };
  it("reminds them what, when, where and how many tickets", () => {
    const { subject, html } = reminderEmail(base);
    expect(subject).toBe("Reminder: Wine night is tomorrow at 18:00");
    expect(html).toContain("<strong>Wine night</strong> with The Courtyard is tomorrow at 18:00");
    expect(html).toContain("12 Main Rd<br>2 tickets");
    expect(html).toContain("Let The Courtyard know on 011 555 0100");
    expect(html).not.toContain("to pay at the event");
  });
  it("tells pay-at-the-event customers how much to bring", () => {
    expect(reminderEmail({ ...base, payAtEventCents: 30000 }).html).toContain("Please bring R300 to pay at the event.");
  });
});

type Signup = { id: string; event_id: string; name: string; email: string | null; quantity: number; payment_status: string };

function fakeAdmin(events: Record<string, unknown>[], signups: Signup[], opts: { claimFails?: string[] } = {}) {
  const queries: string[][] = [];
  const claims: string[] = [];
  const client = {
    from(table: string) {
      const filters: string[] = [];
      queries.push(filters);
      let update = false;
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push(`${table}.${k}=${v}`), q),
        gt: () => q,
        lte: () => q,
        lt: (k: string) => (filters.push(`${table}.${k}<`), q),
        is: (k: string, v: unknown) => (filters.push(`${table}.${k} is ${v}`), q),
        in: (k: string, v: unknown[]) => (filters.push(`${table}.${k} in ${v.join(",")}`), q),
        not: (k: string, op: string, v: unknown) => (filters.push(`${table}.${k} not ${op} ${v}`), q),
        update: () => ((update = true), q),
        maybeSingle: async () => ({ data: { business_name: "The Courtyard", handoff_contact: "" } }),
        then(resolve: (v: unknown) => void) {
          if (table === "events") return resolve({ data: events, error: null });
          if (update) {
            const id = filters.find((f) => f.startsWith("event_signups.id="))!.split("=")[1]!;
            claims.push(id);
            return resolve({ data: opts.claimFails?.includes(id) ? [] : [{ id }], error: null });
          }
          const eventId = filters.find((f) => f.startsWith("event_signups.event_id="))?.split("=")[1];
          return resolve({ data: signups.filter((s) => s.event_id === eventId), error: null });
        },
      };
      return q;
    },
  };
  return { admin: client as unknown as SupabaseClient, queries, claims };
}

const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  tenant_id: "t1",
  title: "Wine night",
  starts_at: "2026-12-02T16:00:00Z",
  location: "12 Main Rd",
  price_cents: 15000,
  ...over,
});
const growth = async () => resolveFeatures("growth", {});

describe("sendEventReminders", () => {
  beforeEach(() => sent.mockClear());

  it("emails each secured sign-up once, with what's owed at the door", async () => {
    const { admin, queries, claims } = fakeAdmin(
      [event()],
      [
        { id: "s1", event_id: "e1", name: "A", email: "a@example.com", quantity: 2, payment_status: "paid" },
        { id: "s2", event_id: "e1", name: "B", email: "b@example.com", quantity: 1, payment_status: "not_required" },
      ],
    );
    expect(await sendEventReminders(admin, growth, NOW)).toEqual({ events: 1, sent: 2 });
    expect(claims).toEqual(["s1", "s2"]);
    expect(sent.mock.calls[0]![0].html).not.toContain("to pay at the event");
    expect(sent.mock.calls[1]![0].html).toContain("Please bring R150 to pay at the event.");
    // Only still-signed-up, not yet reminded, secured, with an email, not just signed up.
    const signupQuery = queries.find((f) => f.includes("event_signups.event_id=e1") && f.includes("event_signups.status=confirmed"))!;
    expect(signupQuery).toEqual(
      expect.arrayContaining([
        "event_signups.reminder_sent_at is null",
        "event_signups.payment_status in not_required,paid",
        "event_signups.email not is null",
        "event_signups.created_at<",
      ]),
    );
  });

  it("doesn't send when another run already claimed the sign-up", async () => {
    const { admin } = fakeAdmin([event()], [{ id: "s1", event_id: "e1", name: "A", email: "a@example.com", quantity: 1, payment_status: "paid" }], { claimFails: ["s1"] });
    expect((await sendEventReminders(admin, growth, NOW)).sent).toBe(0);
    expect(sent).not.toHaveBeenCalled();
  });

  it("skips businesses without events in their plan", async () => {
    const { admin } = fakeAdmin([event()], [{ id: "s1", event_id: "e1", name: "A", email: "a@example.com", quantity: 1, payment_status: "paid" }]);
    expect((await sendEventReminders(admin, async () => resolveFeatures("starter", {}), NOW)).sent).toBe(0);
  });
});
