import { describe, it, expect } from "vitest";
import { computeSlots, type CalendarDay, type DayException, type TimeWindow } from "../lib/bookings/availability";
import { matchService } from "../lib/bookings/catalog";
import { localToUtcDate, startOfLocalDay } from "../lib/time";

// The pre-staff behaviour: one business calendar, 15-minute starts, no
// notice or horizon. These tests predate staff and must keep passing.
function computeOpenSlots(p: {
  dateISO: string;
  rules: TimeWindow[];
  exception: DayException | null;
  existingBookings: { starts_at: string; ends_at: string }[];
  durationMinutes: number;
  now: Date;
}): string[] {
  return computeSlots({
    dateISO: p.dateISO,
    now: p.now,
    rules: { leadMinutes: 0, horizonDays: 100_000, slotMinutes: 15 },
    service: { durationMinutes: p.durationMinutes, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    exception: p.exception,
    calendars: [
      {
        staffId: null,
        capacity: 1,
        windows: p.rules,
        ownHours: false,
        timeOff: [],
        bookings: p.existingBookings.map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) })),
        bookedToday: 0,
      },
    ],
  })
    .filter((s) => s.staffIds.length > 0)
    .map((s) => s.time);
}

const DATE = "2026-09-24";
const FAR_PAST = new Date("2000-01-01T00:00:00Z");

describe("computeSlots: single business calendar (unchanged behaviour)", () => {
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

describe("matchService", () => {
  const services = [
    { name: "Women's Cut & Blow-dry" },
    { name: "Men's Cut" },
    { name: "Full Colour" },
    { name: "Balayage" },
  ];
  const match = (q: string) => matchService(services, q)?.name ?? null;

  it("never matches men's cut to the women's service", () => {
    expect(match("Men's Cut")).toBe("Men's Cut");
    expect(match("men's cut")).toBe("Men's Cut");
    expect(match("Men’s Cut")).toBe("Men's Cut"); // curly apostrophe
  });

  it("matches a unique whole-word part of a name", () => {
    expect(match("colour")).toBe("Full Colour");
    expect(match("women's cut")).toBe("Women's Cut & Blow-dry");
  });

  it("refuses ambiguous or unknown names instead of guessing", () => {
    expect(match("cut")).toBeNull(); // both cuts
    expect(match("Haircut")).toBeNull();
    expect(match("Men's Cut + Full Colour")).toBeNull();
    expect(match("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Staff, buffers, notice, horizon, slot size and capacity.
// ---------------------------------------------------------------------------

const NOW = localToUtcDate("2026-09-23", "08:00"); // the day before DATE
const at = (time: string, date = DATE) => localToUtcDate(date, time).getTime();
const range = (from: string, to: string) => ({ start: at(from), end: at(to) });
const RULES = { leadMinutes: 0, horizonDays: 60, slotMinutes: 15 };
const THIRTY = { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };

function cal(overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    staffId: null,
    capacity: 1,
    windows: [{ start_time: "09:00", end_time: "11:00" }],
    ownHours: false,
    timeOff: [],
    bookings: [],
    bookedToday: 0,
    ...overrides,
  };
}

function slots(p: Partial<Parameters<typeof computeSlots>[0]> = {}) {
  return computeSlots({
    dateISO: DATE,
    now: NOW,
    rules: RULES,
    service: THIRTY,
    exception: null,
    calendars: [cal()],
    ...p,
  });
}
const free = (s: ReturnType<typeof slots>) => s.filter((x) => x.staffIds.length > 0).map((x) => x.time);

describe("computeSlots: buffers", () => {
  it("keeps the buffer clear on both sides of an existing booking", () => {
    // Existing 10:00-10:30 booking with a 15-minute clean-up after it.
    const result = slots({
      service: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 15 },
      calendars: [cal({ windows: [{ start_time: "09:00", end_time: "12:00" }], bookings: [range("10:00", "10:45")] })],
    });
    // 09:15 would end 09:45 + 15 buffer = 10:00: fits. 09:30 would clash.
    expect(free(result)).toEqual(["09:00", "09:15", "10:45", "11:00", "11:15", "11:30"]);
  });

  it("lets the appointment, not its buffer, fill the opening hours", () => {
    const result = slots({ service: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 30 } });
    expect(free(result).at(-1)).toBe("10:30");
  });
});

describe("computeSlots: notice, horizon and slot size", () => {
  it("hides times inside the minimum notice", () => {
    const result = slots({ now: new Date(at("09:10")), rules: { ...RULES, leadMinutes: 60 } });
    expect(free(result)[0]).toBe("10:15");
  });

  it("offers nothing beyond the booking horizon or in the past", () => {
    expect(slots({ rules: { ...RULES, horizonDays: 0 } })).toEqual([]); // DATE is tomorrow
    expect(slots({ rules: { ...RULES, horizonDays: 1 } }).length).toBeGreaterThan(0);
    expect(slots({ now: localToUtcDate("2026-09-25", "08:00") })).toEqual([]);
  });

  it("steps start times by the business's slot size", () => {
    expect(free(slots({ rules: { ...RULES, slotMinutes: 30 } }))).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(free(slots({ rules: { ...RULES, slotMinutes: 60 } }))).toEqual(["09:00", "10:00"]);
  });
});

describe("computeSlots: staff", () => {
  const thandi = (o: Partial<CalendarDay> = {}) => cal({ staffId: "thandi", ...o });
  const lebo = (o: Partial<CalendarDay> = {}) => cal({ staffId: "lebo", ...o });

  it("shows a time as fully booked, not missing, when everyone is busy", () => {
    const result = slots({
      calendars: [thandi({ bookings: [range("09:00", "09:30")] }), lebo({ bookings: [range("09:00", "09:30")] })],
    });
    expect(result.find((s) => s.time === "09:00")).toEqual({ time: "09:00", staffIds: [] });
    expect(result.find((s) => s.time === "09:30")?.staffIds).toEqual(["thandi", "lebo"]);
  });

  it("offers the least busy person first for 'anyone'", () => {
    const result = slots({ calendars: [thandi({ bookedToday: 3 }), lebo({ bookedToday: 1 })] });
    expect(result[0].staffIds).toEqual(["lebo", "thandi"]);
  });

  it("uses each person's own hours, and a special-hours day narrows them", () => {
    const own = thandi({ ownHours: true, windows: [{ start_time: "10:00", end_time: "12:00" }] });
    expect(free(slots({ calendars: [own] }))[0]).toBe("10:00");
    const narrowed = slots({
      calendars: [own],
      exception: { is_closed: false, start_time: "09:00", end_time: "11:00" },
    });
    expect(free(narrowed)).toEqual(["10:00", "10:15", "10:30"]);
  });

  it("skips a person during their time off", () => {
    const result = slots({ calendars: [thandi({ timeOff: [range("09:00", "10:00")] }), lebo()] });
    expect(result.find((s) => s.time === "09:00")?.staffIds).toEqual(["lebo"]);
    expect(result.find((s) => s.time === "10:00")?.staffIds).toEqual(["thandi", "lebo"]);
  });

  it("closes everyone on a closed day", () => {
    expect(slots({ calendars: [thandi(), lebo()], exception: { is_closed: true, start_time: null, end_time: null } })).toEqual([]);
  });
});

describe("computeSlots: capacity", () => {
  it("keeps a class open until it's full", () => {
    const yoga = (booked: number) =>
      slots({ calendars: [cal({ staffId: "studio", capacity: 3, bookings: Array(booked).fill(range("09:00", "09:30")) })] });
    expect(yoga(2).find((s) => s.time === "09:00")?.staffIds).toEqual(["studio"]);
    expect(yoga(3).find((s) => s.time === "09:00")?.staffIds).toEqual([]);
  });
});
