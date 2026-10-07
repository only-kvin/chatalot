import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalTime, localDateISO, startOfLocalDay } from "@/lib/time";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { LOW_RATING_MAX } from "@/lib/bookings/rating";
import type { OwnerEmail } from "@/lib/email/send";

// The owner's morning email: today's bookings, what needs them, and what
// happened yesterday. Loading (queries) and building (pure, tested) are kept
// apart; sending lives in lib/email/send-daily-summary.ts.

const DAY_MS = 24 * 60 * 60 * 1000;
// How far back "not marked Attended / No-show yet" looks. Older ones have
// missed their review request anyway, so nagging about them helps no one.
const UNMARKED_LOOKBACK_DAYS = 7;

export type SummaryBooking = {
  startsAt: string;
  serviceName: string;
  customer: string;
  phone: string;
  reminderNotSent: boolean;
};

export type DailySummaryData = {
  businessName: string;
  today: SummaryBooking[];
  waitingChats: number;
  newLeads: number;
  pendingBookings: number;
  unmarkedBookings: number;
  yesterday: {
    leads: number;
    bookingsMade: number;
    cancelled: number;
    attended: number;
    noShows: number;
    conversations: number;
    ratings: { customer: string; rating: number }[];
  };
};

// SA day bounds around `now`, as UTC ISO strings. SA has no DST, so a day is
// always 24 hours.
export function summaryDays(now: Date) {
  const todayStart = startOfLocalDay(now);
  return {
    todayISO: localDateISO(now),
    yesterdayStart: new Date(todayStart.getTime() - DAY_MS).toISOString(),
    todayStart: todayStart.toISOString(),
    tomorrowStart: new Date(todayStart.getTime() + DAY_MS).toISOString(),
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// null = a quiet day: nothing today, nothing waiting, nothing happened
// yesterday. No email then, so owners don't learn to ignore it.
export function buildDailySummary(d: DailySummaryData): OwnerEmail | null {
  const y = d.yesterday;
  const yesterdayLines = [
    y.leads && plural(y.leads, "new lead"),
    y.bookingsMade && plural(y.bookingsMade, "booking") + " made",
    y.cancelled && plural(y.cancelled, "cancellation"),
    y.attended && `${y.attended} attended`,
    y.noShows && plural(y.noShows, "no-show"),
    y.conversations && plural(y.conversations, "customer chat") + " with new messages",
  ].filter((line): line is string => Boolean(line));
  if (y.ratings.length > 0) {
    const average = y.ratings.reduce((sum, r) => sum + r.rating, 0) / y.ratings.length;
    yesterdayLines.push(`${plural(y.ratings.length, "rating")}, average ${average.toFixed(1)} out of 5`);
    for (const r of y.ratings.filter((r) => r.rating <= LOW_RATING_MAX)) {
      yesterdayLines.push(`${r.customer} rated their visit ${r.rating}/5: worth a call`);
    }
  }

  const attentionLines = [
    d.waitingChats && `${plural(d.waitingChats, "chat")} waiting for a person to reply`,
    d.newLeads && `${plural(d.newLeads, "new lead")} not contacted yet`,
    d.pendingBookings && `${plural(d.pendingBookings, "booking")} waiting for your approval`,
    d.unmarkedBookings &&
      `${plural(d.unmarkedBookings, "past booking")} not marked Attended or No-show. ` +
        `Mark them so customers who came get a review request`,
  ].filter((line): line is string => Boolean(line));

  if (d.today.length === 0 && attentionLines.length === 0 && yesterdayLines.length === 0) return null;

  const todayLines = [...d.today]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(
      (b) =>
        `${formatLocalTime(b.startsAt)}  ${b.serviceName}, ${b.customer} (${b.phone})` +
        (b.reminderNotSent ? ". Reminder not sent: give them a call" : ""),
    );

  const business = d.businessName || "your business";
  const bookingsToday = d.today.length ? plural(d.today.length, "booking") : "no bookings";
  return {
    subject: `Your day at ${business}: ${bookingsToday} today`,
    intro: `Good morning! Here's your day at ${business}.`,
    details: [],
    sections: [
      { heading: "Today's bookings", lines: todayLines.length ? todayLines : ["No bookings today."] },
      { heading: "Needs your attention", lines: attentionLines },
      { heading: "Yesterday", lines: yesterdayLines },
    ],
    footer: "No email on a morning means nothing needed you. You can turn this summary off in Settings.",
    path: "/dashboard/bookings",
  };
}

// A many-to-one embed comes back as an object, not an array.
function serviceName(services: unknown): string {
  return (services as { name: string } | null)?.name ?? "Appointment";
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function loadDailySummaryData(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  now: Date,
): Promise<DailySummaryData> {
  const days = summaryDays(now);
  const unmarkedSince = new Date(new Date(days.todayStart).getTime() - UNMARKED_LOOKBACK_DAYS * DAY_MS).toISOString();
  const head = { count: "exact" as const, head: true };
  const eventsYesterday = (type: string) =>
    count(
      admin
        .from("booking_events")
        .select("id", head)
        .eq("tenant_id", tenantId)
        .eq("type", type)
        .gte("created_at", days.yesterdayStart)
        .lt("created_at", days.todayStart),
    );

  const [
    todayResult,
    waitingChats,
    newLeads,
    pendingBookings,
    unmarkedBookings,
    leads,
    bookingsMade,
    cancelled,
    attended,
    noShows,
    messagesResult,
    ratingsResult,
  ] = await Promise.all([
    admin
      .from("bookings")
      .select("id, name, phone, starts_at, reminder_sent_at, services(name)")
      .eq("tenant_id", tenantId)
      .eq("status", "confirmed")
      .gte("starts_at", days.todayStart)
      .lt("starts_at", days.tomorrowStart),
    count(admin.from("conversations").select("id", head).eq("tenant_id", tenantId).eq("status", "human")),
    count(admin.from("leads").select("id", head).eq("tenant_id", tenantId).eq("status", "new")),
    count(
      admin
        .from("bookings")
        .select("id", head)
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .gte("starts_at", days.todayStart),
    ),
    count(
      admin
        .from("bookings")
        .select("id", head)
        .eq("tenant_id", tenantId)
        .eq("status", "confirmed")
        .gte("starts_at", unmarkedSince)
        .lt("ends_at", days.todayStart),
    ),
    count(
      admin
        .from("leads")
        .select("id", head)
        .eq("tenant_id", tenantId)
        .gte("created_at", days.yesterdayStart)
        .lt("created_at", days.todayStart),
    ),
    count(
      admin
        .from("bookings")
        .select("id", head)
        .eq("tenant_id", tenantId)
        .gte("created_at", days.yesterdayStart)
        .lt("created_at", days.todayStart),
    ),
    eventsYesterday("cancelled"),
    eventsYesterday("attended"),
    eventsYesterday("no_show"),
    admin
      .from("messages")
      .select("conversation_id")
      .eq("tenant_id", tenantId)
      .eq("role", "user")
      .gte("created_at", days.yesterdayStart)
      .lt("created_at", days.todayStart),
    admin
      .from("bookings")
      .select("name, review_rating")
      .eq("tenant_id", tenantId)
      .not("review_rating", "is", null)
      .gte("review_rated_at", days.yesterdayStart)
      .lt("review_rated_at", days.todayStart),
  ]);
  for (const r of [todayResult, messagesResult, ratingsResult]) if (r.error) throw r.error;

  // Today's bookings whose reminder couldn't go out (the reminder job runs
  // just before this, so its outcome is already recorded).
  const unsentIds = (todayResult.data ?? []).filter((b) => !b.reminder_sent_at).map((b) => b.id);
  const notSent = new Set<string>();
  if (unsentIds.length) {
    const { data, error } = await admin
      .from("booking_events")
      .select("booking_id")
      .eq("tenant_id", tenantId)
      .eq("type", "reminder_not_sent")
      .in("booking_id", unsentIds);
    if (error) throw error;
    for (const e of data ?? []) notSent.add(e.booking_id);
  }

  return {
    businessName,
    today: (todayResult.data ?? []).map((b) => ({
      startsAt: b.starts_at,
      serviceName: serviceName(b.services),
      customer: b.name,
      phone: formatPhone(canonicalPhone(b.phone)) || b.phone,
      reminderNotSent: notSent.has(b.id),
    })),
    waitingChats,
    newLeads,
    pendingBookings,
    unmarkedBookings,
    yesterday: {
      leads,
      bookingsMade,
      cancelled,
      attended,
      noShows,
      conversations: new Set((messagesResult.data ?? []).map((m) => m.conversation_id)).size,
      ratings: (ratingsResult.data ?? []).map((r) => ({ customer: r.name, rating: r.review_rating as number })),
    },
  };
}
