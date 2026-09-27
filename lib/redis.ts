import { Redis } from "@upstash/redis";

// Explicit url/token rather than Redis.fromEnv() — the Vercel Marketplace
// provisions Upstash under KV_REST_API_* names, not UPSTASH_REDIS_REST_*.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
