import { describe, it, expect, vi } from "vitest";
import { customerTurns, type TurnStore } from "../lib/channels/customer-lock";

// In-memory stand-in for Redis; TTLs are ignored since tests don't wait on them.
function memoryStore(): TurnStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async setIfAbsent(key, value) {
      if (data.has(key)) return false;
      data.set(key, value);
      return true;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async get(key) {
      return data.get(key) ?? null;
    },
    async deleteIfEquals(key, value) {
      if (data.get(key) === value) data.delete(key);
    },
  };
}

const fastWait = { pollMs: 1, sleep: () => new Promise<void>((r) => setTimeout(r, 1)) };

describe("customerTurns.withLock", () => {
  it("runs one customer's turns one at a time", async () => {
    const turns = customerTurns(memoryStore(), "tenant-a", "27820000000");
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((r) => (releaseFirst = r));

    const first = turns.withLock(async () => {
      order.push("first:start");
      await firstBlocked;
      order.push("first:end");
    }, fastWait);
    const second = turns.withLock(async () => {
      order.push("second");
    }, fastWait);

    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("doesn't block other customers or other tenants", async () => {
    const store = memoryStore();
    const ran: string[] = [];
    let release!: () => void;
    const held = customerTurns(store, "tenant-a", "27820000000").withLock(
      () => new Promise<void>((r) => (release = r)),
      fastWait,
    );

    await customerTurns(store, "tenant-a", "27830000000").withLock(async () => void ran.push("other phone"), fastWait);
    await customerTurns(store, "tenant-b", "27820000000").withLock(async () => void ran.push("other tenant"), fastWait);
    expect(ran).toEqual(["other phone", "other tenant"]);
    release();
    await held;
  });

  it("releases the lock when the turn throws", async () => {
    const store = memoryStore();
    const turns = customerTurns(store, "t", "p");
    await expect(turns.withLock(async () => { throw new Error("boom"); }, fastWait)).rejects.toThrow("boom");
    expect(store.data.has("wa:lock:t:p")).toBe(false);
  });

  it("goes ahead without the lock after waiting too long", async () => {
    const store = memoryStore();
    store.data.set("wa:lock:t:p", "someone-else");
    const turns = customerTurns(store, "t", "p");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await turns.withLock(async () => "replied", { ...fastWait, waitMs: 10 });
    expect(result).toBe("replied");
    // Never deletes a lock it didn't take.
    expect(store.data.get("wa:lock:t:p")).toBe("someone-else");
    errors.mockRestore();
  });

  it("still replies when Redis is down", async () => {
    const broken: TurnStore = {
      setIfAbsent: () => Promise.reject(new Error("redis down")),
      set: () => Promise.reject(new Error("redis down")),
      get: () => Promise.reject(new Error("redis down")),
      deleteIfEquals: () => Promise.reject(new Error("redis down")),
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const turns = customerTurns(broken, "t", "p");

    await turns.markLatest("m1");
    expect(await turns.isSuperseded("m1")).toBe(false);
    expect(await turns.withLock(async () => "replied", fastWait)).toBe("replied");
    errors.mockRestore();
  });
});

describe("customerTurns.isSuperseded", () => {
  it("treats a reply as stale once a newer message is marked", async () => {
    const turns = customerTurns(memoryStore(), "t", "p");
    await turns.markLatest("m1");
    expect(await turns.isSuperseded("m1")).toBe(false);

    await turns.markLatest("m2");
    expect(await turns.isSuperseded("m1")).toBe(true);
    expect(await turns.isSuperseded("m2")).toBe(false);
  });

  it("isn't stale when nothing has been marked", async () => {
    const turns = customerTurns(memoryStore(), "t", "p");
    expect(await turns.isSuperseded("m1")).toBe(false);
  });

  it("scopes markers per customer", async () => {
    const store = memoryStore();
    await customerTurns(store, "t", "p1").markLatest("m1");
    await customerTurns(store, "t", "p2").markLatest("m2");
    expect(await customerTurns(store, "t", "p1").isSuperseded("m1")).toBe(false);
  });
});
