import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDailySummary, summaryDays, type DailySummaryData } from "../lib/summary/daily-summary";
import { renderOwnerEmail } from "../lib/email/send";

const sendOwnerEmail = vi.fn();
vi.mock("../lib/email/send", async (orig) => ({
  ...(await orig<typeof import("../lib/email/send")>()),
  sendOwnerEmail: (...a: unknown[]) => sendOwnerEmail(...a),
}));

function data(overrides: Partial<DailySummaryData> = {}): DailySummaryData {
  return {
    businessName: "Demo Salon",
    today: [],
    waitingChats: 0,
    newLeads: 0,
    pendingBookings: 0,
    newMessages: 0,
    unmarkedBookings: 0,
    yesterday: { leads: 0, bookingsMade: 0, cancelled: 0, attended: 0, noShows: 0, conversations: 0, ratings: [] },
    ...overrides,
  };
}

function section(email: ReturnType<typeof buildDailySummary>, heading: string): string[] {
  return email?.sections?.find((s) => s.heading === heading)?.lines ?? [];
}

describe("summaryDays", () => {
  it("uses SA days, not UTC ones", () => {
    // 23:30 UTC on 6 Oct is 01:30 SA on 7 Oct.
    const days = summaryDays(new Date("2026-10-06T23:30:00Z"));
    expect(days.todayISO).toBe("2026-10-07");
    expect(days.todayStart).toBe("2026-10-06T22:00:00.000Z");
    expect(days.tomorrowStart).toBe("2026-10-07T22:00:00.000Z");
    expect(days.yesterdayStart).toBe("2026-10-05T22:00:00.000Z");
  });
});

describe("buildDailySummary", () => {
  it("sends nothing on a quiet day", () => {
    expect(buildDailySummary(data())).toBeNull();
  });

  it("lists today's bookings in time order, in SA time", () => {
    const email = buildDailySummary(
      data({
        today: [
          { startsAt: "2026-10-07T12:00:00Z", serviceName: "Colour", customer: "Lebo", phone: "082 000 0002", reminderNotSent: false },
          { startsAt: "2026-10-07T07:30:00Z", serviceName: "Cut", customer: "Thandi", phone: "082 000 0001", reminderNotSent: true },
        ],
      }),
    );
    expect(email?.subject).toBe("Your day at Demo Salon: 2 bookings today");
    const lines = section(email, "Today's bookings");
    expect(lines[0]).toMatch(/^09:30 {2}Cut, Thandi \(082 000 0001\)\. Reminder not sent/);
    expect(lines[1]).toMatch(/^14:00 {2}Colour, Lebo/);
    expect(lines[1]).not.toContain("Reminder not sent");
  });

  it("still sends when only something needs attention", () => {
    const email = buildDailySummary(data({ waitingChats: 1, unmarkedBookings: 2 }));
    expect(email?.subject).toBe("Your day at Demo Salon: no bookings today");
    expect(section(email, "Needs your attention")).toEqual([
      "1 chat waiting for a person to reply",
      expect.stringMatching(/^2 past bookings not marked Attended or No-show/),
    ]);
    expect(section(email, "Today's bookings")).toEqual(["No bookings today."]);
  });

  it("summarises yesterday, skipping zero counts and flagging low ratings", () => {
    const email = buildDailySummary(
      data({
        yesterday: {
          leads: 1,
          bookingsMade: 3,
          cancelled: 0,
          attended: 2,
          noShows: 0,
          conversations: 4,
          ratings: [
            { customer: "Thandi", rating: 5 },
            { customer: "Lebo", rating: 2 },
          ],
        },
      }),
    );
    expect(section(email, "Yesterday")).toEqual([
      "1 new lead",
      "3 bookings made",
      "2 attended",
      "4 customer chats with new messages",
      "2 ratings, average 3.5 out of 5",
      "Lebo rated their visit 2/5: worth a call",
    ]);
    expect(section(email, "Needs your attention")).toEqual([]);
  });

  it("escapes customer names in the email", () => {
    const email = buildDailySummary(
      data({
        today: [{ startsAt: "2026-10-07T07:30:00Z", serviceName: "Cut", customer: "<b>x</b>", phone: "1", reminderNotSent: false }],
      }),
    );
    const html = renderOwnerEmail(email!);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("No email on a morning means nothing needed you");
    // Empty sections aren't rendered.
    expect(html).not.toContain("Needs your attention");
  });
});

describe("sendDailySummary", () => {
  it("claims the day and sends nothing when another run already did", async () => {
    const { sendDailySummary } = await import("../lib/email/send-daily-summary");
    const chain = {
      update: () => chain,
      eq: () => chain,
      or: (filter: string) => {
        expect(filter).toBe("daily_summary_sent_on.is.null,daily_summary_sent_on.lt.2026-10-07");
        return chain;
      },
      select: async () => ({ data: [], error: null }),
    };
    const admin = { from: () => chain } as unknown as SupabaseClient;
    const result = await sendDailySummary(admin, { tenantId: "t1", businessName: "Demo Salon" }, new Date("2026-10-07T06:00:00Z"));
    expect(result).toBe("already_sent");
    expect(sendOwnerEmail).not.toHaveBeenCalled();
  });
});
