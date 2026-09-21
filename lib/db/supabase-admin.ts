import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS entirely — only import from API routes,
// Server Actions, and scripts (tsx/vitest run outside Next's bundler, so this
// file deliberately avoids the `server-only` package, which throws unconditionally
// outside Next's own webpack/turbopack build). Never import this from a
// "use client" component — SUPABASE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so it's
// never inlined into a browser bundle, but there's no build-time guard beyond that.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
