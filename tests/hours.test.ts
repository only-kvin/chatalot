import { describe, it, expect } from "vitest";
import { checkNewWindow, describeTimeOff, timeOffRange } from "../lib/bookings/hours";
import { describeEvent, isReassignment, type BookingEvent } from "../lib/bookings/labels";

describe("checkNewWindow", () => {
  const monday = [{ weekday: 1, start_time: "09:00:00", end_time: "13:00:00" }];

  it("allows a second window after a break", () => {
    expect(checkNewWindow(monday, { weekday: 1, start_time: "14:00", end_time: "18:00" })).toBeNull();
    // Back to back is fine too.
    expect(checkNewWindow(monday, { weekday: 1, start_time: "13:00", end_time: "15:00" })).toBeNull();
  });

  it("refuses overlapping hours on the same day only", () => {
    expect(checkNewWindow(monday, { weekday: 1, start_time: "12:00", end_time: "15:00" })).toBe(
      "That overlaps 09:00–13:00 on the same day.",
    );
    expect(checkNewWindow(monday, { weekday: 2, start_time: "12:00", end_time: "15:00" })).toBeNull();
  });

  it("refuses a window that ends before it starts", () => {
    expect(checkNewWindow([], { weekday: 1, start_time: "17:00", end_time: "09:00" })).toMatch(/before the end/);
  });
});

describe("timeOffRange", () => {
  it("covers whole days from SA midnight to the midnight after the last day", () => {
    expect(timeOffRange({ fromDate: "2026-10-12", toDate: "2026-10-14", fromTime: null, toTime: null })).toEqual({
      startsAt: "2026-10-11T22:00:00.000Z",
      endsAt: "2026-10-14T22:00:00.000Z",
    });
  });

  it("covers part of a day in SA time", () => {
    expect(timeOffRange({ fromDate: "2026-10-12", toDate: "2026-10-12", fromTime: "13:00", toTime: "17:00" })).toEqual({
      startsAt: "2026-10-12T11:00:00.000Z",
      endsAt: "2026-10-12T15:00:00.000Z",
    });
  });

  it("refuses ranges that don't make sense", () => {
    const err = (t: Parameters<typeof timeOffRange>[0]) => ("error" in timeOffRange(t) ? "error" : "ok");
    expect(err({ fromDate: "2026-10-12", toDate: "2026-10-11", fromTime: null, toTime: null })).toBe("error");
    expect(err({ fromDate: "2026-10-12", toDate: "2026-10-12", fromTime: "13:00", toTime: null })).toBe("error");
    expect(err({ fromDate: "2026-10-12", toDate: "2026-10-13", fromTime: "13:00", toTime: "17:00" })).toBe("error");
    expect(err({ fromDate: "2026-10-12", toDate: "2026-10-12", fromTime: "17:00", toTime: "13:00" })).toBe("error");
  });
});

describe("describeTimeOff", () => {
  it("names whole days, ranges and part-days in SA time", () => {
    expect(describeTimeOff("2026-10-11T22:00:00Z", "2026-10-12T22:00:00Z")).toBe("Mon 12 Oct");
    expect(describeTimeOff("2026-10-11T22:00:00Z", "2026-10-14T22:00:00Z")).toBe("Mon 12 Oct – Wed 14 Oct");
    expect(describeTimeOff("2026-10-12T11:00:00Z", "2026-10-12T15:00:00Z")).toBe("Mon 12 Oct, 13:00–17:00");
  });
});

describe("booking history for staff changes", () => {
  const event = (details: Record<string, unknown>): BookingEvent => ({
    type: "rescheduled",
    actor: "team",
    channel: "dashboard",
    details,
    created_by: "me",
    created_at: "2026-10-07T10:00:00Z",
  });
  const names = new Map([["s1", "Thandi"]]);

  it("describes giving a booking to someone else at the same time", () => {
    const e = event({ from: "2026-10-12T08:00:00+00:00", to: "2026-10-12T08:00:00+00:00", staff_to: "s1" });
    expect(isReassignment(e)).toBe(true);
    expect(describeEvent(e, "me", names)).toBe("Given to Thandi by you");
  });

  it("still describes a move, with the new person when it changed", () => {
    const e = event({ from: "2026-10-12T08:00:00+00:00", to: "2026-10-12T09:00:00+00:00", staff_to: "s1" });
    expect(isReassignment(e)).toBe(false);
    expect(describeEvent(e, "me", names)).toMatch(/^Moved by you: .* → .*, now with Thandi$/);
  });
});
