import { cache } from "react";
import { createClient } from "./supabase-server";

export type SessionUser = { id: string; email: string | null };

// The signed-in user for this request, or null. Uses getClaims(), which
// verifies the session JWT locally against the project's (cached) signing
// keys, instead of getUser(), which is a network round trip to Supabase Auth
// on every call. proxy.ts has already refreshed an expired session by the
// time a page renders. cache() makes it one check per request no matter how
// many layouts and helpers ask.
//
// This is no weaker than getUser() for data access: RLS trusts the very same
// JWT (signature + expiry) on every query either way.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
