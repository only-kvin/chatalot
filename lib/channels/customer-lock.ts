import { randomUUID } from "node:crypto";
import type { Redis } from "@upstash/redis";

// Coordinates one WhatsApp customer's turns. Customers often send bursts
// ("hi" / "do you do nails?" / "tomorrow?"), which Meta delivers as separate
// webhooks — possibly to different function instances — so this lives in
// Redis rather than in memory. Two pieces:
//   - a lock, so turns run one at a time and each sees the previous reply;
//   - a "latest message" marker, so a reply that a newer message has made
//     stale is dropped: the newer message's turn answers the whole burst.

export type TurnStore = {
  // Resolves true if the key was free and is now set.
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  get(key: string): Promise<string | null>;
  // Deletes only if the key still holds `value`.
  deleteIfEquals(key: string, value: string): Promise<void>;
};

// Compare-and-delete, so a turn that outlived its lock TTL can't release the
// lock the next turn now holds.
const DELETE_IF_EQUALS = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

export function redisTurnStore(redis: Redis): TurnStore {
  return {
    async setIfAbsent(key, value, ttlMs) {
      return (await redis.set(key, value, { nx: true, px: ttlMs })) === "OK";
    },
    async set(key, value, ttlMs) {
      await redis.set(key, value, { px: ttlMs });
    },
    async get(key) {
      return redis.get<string>(key);
    },
    async deleteIfEquals(key, value) {
      await redis.eval(DELETE_IF_EQUALS, [key], [value]);
    },
  };
}

export type LockOptions = {
  // Auto-expiry, in case a function dies holding the lock. Must outlast a full
  // turn: 20s agent deadline + DB writes + the WhatsApp send.
  ttlMs?: number;
  // How long to wait for the customer's previous turn before going ahead anyway.
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

// Outlives any turn (lock wait + turn), so the marker can't expire while a
// stale turn is still running.
const LATEST_TTL_MS = 10 * 60 * 1000;

// Every method degrades to "carry on as if there were no coordination" when
// Redis fails: out-of-order or duplicate replies beat no reply at all.
export function customerTurns(store: TurnStore, tenantId: string, customerPhone: string) {
  const lockKey = `wa:lock:${tenantId}:${customerPhone}`;
  const latestKey = `wa:latest:${tenantId}:${customerPhone}`;

  return {
    // Call on arrival, before waiting for the lock.
    async markLatest(messageId: string): Promise<void> {
      try {
        await store.set(latestKey, messageId, LATEST_TTL_MS);
      } catch (err) {
        console.error(`Couldn't mark ${latestKey}:`, err);
      }
    },

    async isSuperseded(messageId: string): Promise<boolean> {
      try {
        const latest = await store.get(latestKey);
        return latest !== null && latest !== messageId;
      } catch (err) {
        console.error(`Couldn't read ${latestKey}:`, err);
        return false;
      }
    },

    async withLock<T>(
      fn: () => Promise<T>,
      { ttlMs = 45_000, waitMs = 45_000, pollMs = 500, sleep = defaultSleep }: LockOptions = {},
    ): Promise<T> {
      const token = randomUUID();
      const deadline = Date.now() + waitMs;
      let held = false;

      try {
        while (!(held = await store.setIfAbsent(lockKey, token, ttlMs)) && Date.now() < deadline) {
          await sleep(pollMs);
        }
      } catch (err) {
        console.error(`Couldn't take ${lockKey}:`, err);
      }
      if (!held) console.error(`${lockKey} not acquired; replying without it.`);

      try {
        return await fn();
      } finally {
        if (held) {
          // On failure it still expires by itself after ttlMs.
          await store.deleteIfEquals(lockKey, token).catch((err) => {
            console.error(`Couldn't release ${lockKey}:`, err);
          });
        }
      }
    },
  };
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
