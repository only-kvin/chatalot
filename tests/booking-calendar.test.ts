import { describe, it, expect } from "vitest";
import {
  addMonths,
  dayLong,
  dayShort,
  groupSlots,
  monthGrid,
  nearestAvailable,
  weekDays,
  weekStart,
} from "../widget/booking/calendar";
import { onColor } from "../widget/shared/theme";

describe("week and month grids", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05"); // Wednesday -> Monday
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week before
    expect(weekDays("2026-10-05")).toEqual([
      "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
    ]);
  });

  it("covers a month in six Monday-first weeks", () => {
    const grid = monthGrid("2026-10-15");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(grid).toContain("2026-10-01");
    expect(grid).toContain("2026-10-31");
  });

  it("moves between months, across years", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("names days without the visitor's time zone shifting them", () => {
    expect(dayShort("2026-10-12")).toBe("Mon");
    expect(dayLong("2026-10-12")).toBe("Monday 12 October");
  });
});

describe("slots", () => {
  const slots = [
    { time: "09:00", available: true },
    { time: "11:45", available: false },
    { time: "12:00", available: true },
    { time: "16:45", available: true },
    { time: "17:00", available: true },
  ];

  it("groups times into morning, afternoon and evening, keeping booked ones", () => {
    expect(groupSlots(slots).map((g) => [g.label, g.slots.map((s) => s.time)])).toEqual([
      ["Morning", ["09:00", "11:45"]],
      ["Afternoon", ["12:00", "16:45"]],
      ["Evening", ["17:00"]],
    ]);
    expect(groupSlots([{ time: "09:00", available: true }]).map((g) => g.label)).toEqual(["Morning"]);
  });

  it("offers the nearest free times when one is taken", () => {
    expect(nearestAvailable(slots, "12:00", 2)).toEqual(["09:00", "16:45"]);
    expect(nearestAvailable(slots, "11:45", 1)).toEqual(["12:00"]);
  });
});

describe("onColor", () => {
  it("picks readable text for the main colour", () => {
    expect(onColor("#1f28ad")).toBe("#ffffff");
    expect(onColor("#facc15")).toBe("#18181b");
  });
});
