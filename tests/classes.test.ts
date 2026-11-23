import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listPublicClasses } from "../lib/classes/public";
import { timetableLabel, weekdaysLabel } from "../app/(dashboard)/dashboard/classes/labels";

describe("timetable wording", () => {
  it("reads days Monday first", () => {
    expect(weekdaysLabel([3, 1])).toBe("Mon & Wed");
    expect(weekdaysLabel([0, 6, 2])).toBe("Tue, Sat & Sun");
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(timetableLabel({ weekdays: [1, 3], start_time: "18:00:00", duration_minutes: 60 })).toBe("Mon & Wed, 18:00 (60 min)");
  });
});

describe("listPublicClasses", () => {
  const NOW = new Date("2026-11-23T10:00:00Z");
  const row = (over: Record<string, unknown>) => ({
    id: "c1",
    series_id: "s1",
    title: "Yoga",
    description: "",
    starts_at: "2026-11-23T16:00:00Z",
    ends_at: "2026-11-23T17:00:00Z",
    location: "Studio 1",
    capacity: 10,
    price_cents: null,
    signups_open: true,
    status: "published",
    staff: { id: "p1", name: "Sarah", avatar_url: null },
    ...over,
  });

  function client(rows: Record<string, unknown>[], taken: Record<string, number>) {
    const filters: string[] = [];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push(`${k}=${v}`), q),
      in: () => q,
      gte: (k: string, v: unknown) => (filters.push(`${k}>=${v}`), q),
      lt: (k: string, v: unknown) => (filters.push(`${k}<${v}`), q),
      order: () => q,
      limit: async () => ({ data: rows, error: null }),
    };
    return {
      db: { from: () => q, rpc: async (_: string, a: { p_event_id: string }) => ({ data: taken[a.p_event_id] ?? 0 }) } as unknown as SupabaseClient,
      filters,
    };
  }

  it("lists a day's classes with instructor, spots and why booking is closed", async () => {
    const { db, filters } = client(
      [
        row({ id: "open" }),
        row({ id: "full", capacity: 4 }),
        row({ id: "off", status: "cancelled" }),
        row({ id: "done", starts_at: "2026-11-23T05:00:00Z" }),
        row({ id: "shut", signups_open: false }),
        row({ id: "nolimit", capacity: null, staff: null }),
      ],
      { open: 3, full: 4 },
    );
    const list = await listPublicClasses(db, "t1", { from: "2026-11-23", to: "2026-11-29" }, NOW);
    const by = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(by.open).toMatchObject({ spotsLeft: 7, closed: null, instructor: { name: "Sarah", avatarUrl: null } });
    expect(by.full).toMatchObject({ spotsLeft: 0, closed: "full" });
    expect(by.off!.closed).toBe("cancelled");
    expect(by.done!.closed).toBe("past");
    expect(by.shut!.closed).toBe("closed");
    expect(by.nolimit).toMatchObject({ spotsLeft: null, instructor: null, closed: null });
    // Only class sessions, SA dates from midnight to the day after the last.
    expect(filters).toEqual(expect.arrayContaining(["kind=class", "tenant_id=t1", "starts_at>=2026-11-22T22:00:00.000Z", "starts_at<2026-11-29T22:00:00.000Z"]));
  });

  it("never asks for more than five weeks", async () => {
    const { db, filters } = client([], {});
    await listPublicClasses(db, "t1", { from: "2026-11-23", to: "2027-06-01" }, NOW);
    expect(filters).toContain("starts_at<2026-12-28T22:00:00.000Z");
  });
});
