import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// rate-limit.ts builds Upstash limiters at import; they aren't used here.
vi.mock("@/lib/redis", () => ({ redis: {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
  },
}));

const { checkDailyTenantCap } = await import("../lib/security/rate-limit");

type Filter = [op: string, column: string, value: unknown];

// Minimal stand-in for the two queries checkDailyTenantCap makes; records the
// filters applied to the messages count so the test can assert on them.
function fakeSupabase(cap: number | null, messageCount: number) {
  const countFilters: Filter[] = [];
  const client = {
    from(table: string) {
      if (table === "agent_configs") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: cap === null ? null : { daily_message_cap: cap } }) }),
          }),
        };
      }
      const query = {
        eq: (c: string, v: unknown) => (countFilters.push(["eq", c, v]), query),
        gt: (c: string, v: unknown) => (countFilters.push(["gt", c, v]), query),
        gte: async (c: string, v: unknown) => (countFilters.push(["gte", c, v]), { count: messageCount }),
      };
      return { select: () => query };
    },
  };
  return { client: client as unknown as SupabaseClient, countFilters };
}

afterEach(() => vi.useRealTimers());

describe("checkDailyTenantCap", () => {
  it("allows turns below the cap and blocks at it", async () => {
    expect((await checkDailyTenantCap(fakeSupabase(5, 4).client, "t")).allowed).toBe(true);
    expect((await checkDailyTenantCap(fakeSupabase(5, 5).client, "t")).allowed).toBe(false);
  });

  it("defaults to 200 when the tenant has no config", async () => {
    expect((await checkDailyTenantCap(fakeSupabase(null, 199).client, "t")).allowed).toBe(true);
    expect((await checkDailyTenantCap(fakeSupabase(null, 200).client, "t")).allowed).toBe(false);
  });

  it("counts this tenant's AI turns since SA midnight", async () => {
    vi.useFakeTimers();
    // 23:30 UTC = 01:30 the next day in SA, so the day started at 22:00 UTC.
    vi.setSystemTime(new Date("2026-09-27T23:30:00Z"));
    const { client, countFilters } = fakeSupabase(5, 0);

    await checkDailyTenantCap(client, "tenant-a");
    expect(countFilters).toEqual([
      ["eq", "tenant_id", "tenant-a"],
      // Rows with token usage = turns that actually ran the model.
      ["gt", "tokens_in", 0],
      ["gte", "created_at", "2026-09-27T22:00:00.000Z"],
    ]);
  });
});
