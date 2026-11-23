import type { SupabaseClient } from "@supabase/supabase-js";

// The events a business shows on its website: published ones (and
// cancelled ones still coming up, shown as cancelled), soonest first, with
// the poster's public URL and how many spots are left. Past events only
// when the widget asks for them.

export type PublicEvent = {
  id: string;
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  posterUrl: string | null;
  // Per ticket; null = free.
  priceCents: number | null;
  maxPerSignup: number;
  // null = no limit.
  spotsLeft: number | null;
  // Why a sign-up isn't possible, if it isn't.
  closed: null | "past" | "cancelled" | "sold_out" | "signups_closed";
};

type Row = {
  id: string;
  title: string;
  summary: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  poster_path: string | null;
  capacity: number | null;
  max_per_signup: number;
  price_cents: number | null;
  signups_open: boolean;
  status: string;
};

const EVENT_COLUMNS =
  "id, title, summary, description, starts_at, ends_at, location, poster_path, capacity, max_per_signup, price_cents, signups_open, status";

export function posterUrl(admin: SupabaseClient, path: string | null): string | null {
  return path ? admin.storage.from("event-posters").getPublicUrl(path).data.publicUrl : null;
}

export async function listPublicEvents(
  admin: SupabaseClient,
  tenantId: string,
  opts: { showPast?: boolean; now?: Date } = {},
): Promise<PublicEvent[]> {
  const now = opts.now ?? new Date();
  let q = admin.from("events").select(EVENT_COLUMNS).eq("tenant_id", tenantId).eq("kind", "event").in("status", ["published", "cancelled"]).limit(100);
  if (!opts.showPast) q = q.gte("starts_at", now.toISOString());
  const { data, error } = await q.order("starts_at");
  if (error) throw error;
  // Cancelled events that already happened aren't worth showing.
  const rows = ((data ?? []) as Row[]).filter((e) => e.status === "published" || new Date(e.starts_at) > now);

  const withLimit = rows.filter((e) => e.capacity !== null);
  const taken = new Map<string, number>();
  await Promise.all(
    withLimit.map(async (e) => {
      const { data: n } = await admin.rpc("event_tickets_taken", { p_event_id: e.id });
      taken.set(e.id, Number(n ?? 0));
    }),
  );

  const upcoming = rows.filter((e) => new Date(e.starts_at) > now);
  const past = rows.filter((e) => new Date(e.starts_at) <= now).reverse();
  return [...upcoming, ...past].map((e) => {
    const spotsLeft = e.capacity === null ? null : Math.max(0, e.capacity - (taken.get(e.id) ?? 0));
    const closed: PublicEvent["closed"] =
      new Date(e.starts_at) <= now
        ? "past"
        : e.status === "cancelled"
          ? "cancelled"
          : spotsLeft === 0
            ? "sold_out"
            : !e.signups_open
              ? "signups_closed"
              : null;
    return {
      id: e.id,
      title: e.title,
      summary: e.summary,
      description: e.description,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      location: e.location,
      posterUrl: posterUrl(admin, e.poster_path),
      priceCents: e.price_cents,
      maxPerSignup: e.max_per_signup,
      spotsLeft,
      closed,
    };
  });
}
