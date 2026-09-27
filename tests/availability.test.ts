import { describe, it, expect } from "vitest";
import { computeOpenSlots, localToUtcDate, startOfLocalDay } from "../lib/agent/availability";

const DATE = "2026-09-24";
const FAR_PAST = new Date("2000-01-01T00:00:00Z");

describe("computeOpenSlots", () => {
  it("returns every 15-minute start that fits the service duration inside a window", () => {
    const slots = computeOpenSlots({
      dateISO: DATE,
      rules: [{ start_time: "09:00", end_time: "11:00" }],
      exception: null,
      existingBookings: [],
      durationMinutes: 30,
      now: FAR_PAST,
    });
    expect(slots).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30"]);
  });

  it("excludes slots that overlap an existing booking, but allows adjacent ones", () => {
    const slots = computeOpenSlots({
      dateISO: DATE,
      rules: [{ start_time: "09:00", end_time: "11:00" }],
      exception: null,
      existingBookings: [
        {
          starts_at: localToUtcDate(DATE, "09:30").toISOString(),
          ends_at: localToUtcDate(DATE, "10:00").toISOString(),
        },
      ],
      durationMinutes: 30,
      now: FAR_PAST,
    });
    // 09:00 (ends 09:30) and 10:00 (starts 10:00) are back-to-back with the
    // booking, not overlapping it, so they stay available.
    expect(slots).toEqual(["09:00", "10:00", "10:15", "10:30"]);
  });

  it("only offers a start time that leaves room for the full duration before the window closes", () => {
    const slots = computeOpenSlots({
      dateISO: DATE,
      rules: [{ start_time: "09:00", end_time: "10:00" }],
      exception: null,
      existingBookings: [],
      durationMinutes: 45,
      now: FAR_PAST,
    });
    expect(slots).toEqual(["09:00", "09:15"]);
  });

  it("returns nothing on a date marked fully closed by an exception", () => {
    const slots = computeOpenSlots({
      dateISO: DATE,
      rules: [{ start_time: "09:00", end_time: "17:00" }],
      exception: { is_closed: true, start_time: null, end_time: null },
      existingBookings: [],
      durationMinutes: 30,
      now: FAR_PAST,
    });
    expect(slots).toEqual([]);
  });

  it("uses an exception's custom hours instead of the weekly rules", () => {
    const slots = computeOpenSlots({
      dateISO: DATE,
      rules: [{ start_time: "09:00", end_time: "17:00" }],
      exception: { is_closed: false, start_time: "10:00", end_time: "11:00" },
      existingBookings: [],
      durationMinutes: 30,
      now: FAR_PAST,
    });
    expect(slots).toEqual(["10:00", "10:15", "10:30"]);
  });

  it("excludes times that have already passed today", () => {
    const slots = computeOpenSlots({
      dateISO: DATE,
      rules: [{ start_time: "09:00", end_time: "10:00" }],
      exception: null,
      existingBookings: [],
      durationMinutes: 15,
      now: localToUtcDate(DATE, "09:20"),
    });
    expect(slots).toEqual(["09:30", "09:45"]);
  });
});

describe("startOfLocalDay", () => {
  it("is SA midnight (22:00 UTC the day before)", () => {
    expect(startOfLocalDay(new Date("2026-09-27T12:00:00Z")).toISOString()).toBe("2026-09-26T22:00:00.000Z");
  });

  it("rolls over at SA midnight, not UTC midnight", () => {
    // 23:30 UTC is already 01:30 the next day in SA.
    expect(startOfLocalDay(new Date("2026-09-27T23:30:00Z")).toISOString()).toBe("2026-09-27T22:00:00.000Z");
    // 21:59 UTC is still 23:59 the same SA day.
    expect(startOfLocalDay(new Date("2026-09-27T21:59:00Z")).toISOString()).toBe("2026-09-26T22:00:00.000Z");
  });
});
