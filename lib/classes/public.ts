import type { SupabaseClient } from "@supabase/supabase-js";

// The class timetable a business shows on its website: sessions (events of
// kind 'class') between two SA dates, with the instructor's name and photo
// and spots left. Cancelled sessions are listed as cancelled so a regular
// isn't left wondering where their class went.

export type PublicClass = {
  id: string;
  seriesId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  instructor: { id: string; name: string; avatarUrl: string | null } | null;
  priceCents: number | null;
  spotsLeft: number | null;
  closed: null | "past" | "cancelled" | "full" | "closed";
};

type Row = {
  id: string;
  series_id: string | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number | null;
  price_cents: number | null;
  signups_open: boolean;
  status: string;
  staff: { id: string; name: string; avatar_url: string | null } | null;
};

const DAY_MS = 86_400_000;

export async function listPublicClasses(
  admin: SupabaseClient,
  tenantId: string,
  range: { from: string; to: string },
  now = new Date(),
): Promise<PublicClass[]> {
  // SA dates; at most five weeks at a time.
  const from = new Date(`${range.from}T00:00:00+02:00`);
  const toDate = new Date(`${range.to}T00:00:00+02:00`);
  const to = new Date(Math.min(toDate.getTime(), from.getTime() + 35 * DAY_MS) + DAY_MS);
  const { data, error } = await admin
    .from("events")
    .select("id, series_id, title, description, starts_at, ends_at, location, capacity, price_cents, signups_open, status, staff(id, name, avatar_url)")
    .eq("tenant_id", tenantId)
    .eq("kind", "class")
    .in("status", ["published", "cancelled"])
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at")
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  const taken = new Map<string, number>();
  await Promise.all(
    rows
      .filter((r) => r.capacity !== null && r.status === "published" && new Date(r.starts_at) > now)
      .map(async (r) => {
        const { data: n } = await admin.rpc("event_tickets_taken", { p_event_id: r.id });
        taken.set(r.id, Number(n ?? 0));
      }),
  );

  return rows.map((r) => {
    const spotsLeft = r.capacity === null ? null : Math.max(0, r.capacity - (taken.get(r.id) ?? 0));
    const closed: PublicClass["closed"] =
      r.status === "cancelled"
        ? "cancelled"
        : new Date(r.starts_at) <= now
          ? "past"
          : spotsLeft === 0
            ? "full"
            : !r.signups_open
              ? "closed"
              : null;
    return {
      id: r.id,
      seriesId: r.series_id,
      title: r.title,
      description: r.description,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      location: r.location,
      instructor: r.staff ? { id: r.staff.id, name: r.staff.name, avatarUrl: r.staff.avatar_url } : null,
      priceCents: r.price_cents,
      spotsLeft,
      closed,
    };
  });
}
