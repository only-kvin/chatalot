import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDate, formatLocalDateTime } from "../lib/agent/availability";
import {
  bookingRef,
  cancelBooking,
  describeBooking,
  insideCutoff,
  listManageableBookings,
} from "../lib/bookings/manage";
import { describeEvent, formatShortLocal } from "../lib/bookings/labels";

describe("readable booking dates", () => {
  it("spells out SA local times so the AI can't mangle them", () => {
    // The booking the AI called "Friday 10 Oct".
    expect(formatLocalDateTime("2026-10-02T08:00:00Z")).toBe("Friday 2 October at 10:00");
    expect(formatLocalDate("2026-09-30")).toBe("Wednesday 30 September");
    expect(formatShortLocal("2026-09-28T00:19:00Z")).toBe("28 Sept, 02:19");
  });

  it("describes a booking with its service", () => {
    expect(describeBooking({ serviceName: "Men's Cut", startsAt: "2026-09-30T13:00:00Z" })).toBe(
      "Men's Cut on Wednesday 30 September at 15:00",
    );
    expect(bookingRef("7b6ca3c0-84ca-40cc-8957-470ffb9c7dd2")).toBe("7B6CA3C0");
  });
});

describe("insideCutoff", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  it("blocks changes closer than the minimum notice", () => {
    expect(insideCutoff("2026-09-30T11:30:00Z", 120, now)).toBe(true);
    expect(insideCutoff("2026-09-30T12:30:00Z", 120, now)).toBe(false);
  });
  it("allows any time with no minimum notice", () => {
    expect(insideCutoff("2026-09-30T10:05:00Z", 0, now)).toBe(false);
  });
});

// Records the filters applied to the bookings query.
function fakeClient(opts: { contactId: string | null; updated?: boolean }) {
  const filters: string[] = [];
  const bookingsQuery = {
    select: () => bookingsQuery,
    eq: (c: string, v: unknown) => (filters.push(`eq ${c}=${v}`), bookingsQuery),
    gt: () => bookingsQuery,
    order: () => bookingsQuery,
    or: (expr: string) => (filters.push(`or ${expr}`), bookingsQuery),
    then: (resolve: (v: unknown) => void) => resolve({ data: [] }),
  };
  const client = {
    from: (table: string) => {
      if (table === "conversations") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: { contact_id: opts.contactId } }),
        };
        return q;
      }
      if (table === "booking_events") return { insert: async () => ({ error: null }) };
      // bookings: list query or the cancel update
      return {
        ...bookingsQuery,
        update: () => {
          const u = {
            eq: () => u,
            select: () => u,
            maybeSingle: async () => ({ data: opts.updated ? { id: "b1" } : null, error: null }),
          };
          return u;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, filters };
}

describe("listManageableBookings", () => {
  it("on the website, only finds bookings made in this chat", async () => {
    const { client, filters } = fakeClient({ contactId: null });
    await listManageableBookings(client, { tenantId: "t", conversationId: "conv", channel: "web" });
    expect(filters).toContain("eq conversation_id=conv");
    expect(filters.some((f) => f.startsWith("or "))).toBe(false);
  });

  it("on WhatsApp, finds everything booked by that phone's customer", async () => {
    const { client, filters } = fakeClient({ contactId: "contact-1" });
    await listManageableBookings(client, { tenantId: "t", conversationId: "conv", channel: "whatsapp" });
    expect(filters).toContain("or conversation_id.eq.conv,contact_id.eq.contact-1");
  });

  it("always filters by tenant and active bookings", async () => {
    const { client, filters } = fakeClient({ contactId: null });
    await listManageableBookings(client, { tenantId: "t", conversationId: "conv", channel: "web" });
    expect(filters).toEqual(expect.arrayContaining(["eq tenant_id=t", "eq status=confirmed"]));
  });
});

describe("cancelBooking", () => {
  it("refuses a booking that's no longer active", async () => {
    const { client } = fakeClient({ contactId: null, updated: false });
    const result = await cancelBooking(client, { tenantId: "t", bookingId: "b1", actor: "ai", channel: "web" });
    expect(result).toEqual({ ok: false, error: "That booking isn't active any more." });
  });

  it("cancels an active booking", async () => {
    const { client } = fakeClient({ contactId: null, updated: true });
    expect(await cancelBooking(client, { tenantId: "t", bookingId: "b1", actor: "ai", channel: "web" })).toEqual({ ok: true });
  });
});

describe("booking history wording", () => {
  const base = { channel: "whatsapp", details: {}, created_by: null, created_at: "2026-09-28T00:19:00Z" };
  it("says who changed what", () => {
    expect(
      describeEvent({ ...base, type: "rescheduled", actor: "ai", details: { from: "2026-09-30T13:00:00Z", to: "2026-10-02T08:00:00Z" } }),
    ).toBe("Moved by the customer on WhatsApp: Wednesday 30 September at 15:00 → Friday 2 October at 10:00");
    expect(describeEvent({ ...base, type: "cancelled", actor: "ai", details: { reason: "can't make it" } })).toBe(
      `Cancelled by the customer on WhatsApp: "can't make it"`,
    );
    expect(describeEvent({ ...base, type: "attended", actor: "team", channel: "dashboard", created_by: "u1" }, "u1")).toBe(
      "Marked attended by you",
    );
    expect(describeEvent({ ...base, type: "no_show", actor: "team", channel: "dashboard", created_by: "u2" }, "u1")).toBe(
      "Marked no-show by your team",
    );
  });
});
