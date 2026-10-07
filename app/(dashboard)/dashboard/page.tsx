import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  CalendarIcon,
  ClockIcon,
  HandIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { addDays, localDateISO, localToUtcDate } from "@/lib/time";
import { STATUS_LABEL, type BookingStatus } from "@/lib/bookings/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type Tone = "indigo" | "pink" | "teal" | "orange";

// Glossy tile gradient + matching glow, per accent.
const TONE: Record<Tone, { tile: string; glow: string }> = {
  indigo: { tile: "bg-[linear-gradient(145deg,#7C76F7,#4338CA)]", glow: "oklch(0.45 0.22 277 / 55%)" },
  pink: { tile: "bg-[linear-gradient(145deg,#F472B6,#BE185D)]", glow: "oklch(0.52 0.21 0 / 45%)" },
  teal: { tile: "bg-[linear-gradient(145deg,#2DD4BF,#0F766E)]", glow: "oklch(0.5 0.09 185 / 45%)" },
  orange: { tile: "bg-[linear-gradient(145deg,#FB923C,#C2410C)]", glow: "oklch(0.55 0.19 40 / 45%)" },
};

const SHORTCUTS: { href: string; title: string; description: string; icon: LucideIcon; tone: Tone }[] = [
  { href: "/dashboard/knowledge", title: "Knowledge", description: "What your AI answers from", icon: BookOpenIcon, tone: "indigo" },
  { href: "/dashboard/widget", title: "Widgets", description: "Look, install snippet, preview", icon: MessageCircleIcon, tone: "pink" },
  { href: "/dashboard/availability", title: "Availability", description: "Open hours and closures", icon: ClockIcon, tone: "teal" },
  { href: "/dashboard/settings", title: "Settings", description: "Business info and domains", icon: SettingsIcon, tone: "orange" },
];

const LEAD_BADGE: Record<string, "info" | "secondary" | "success" | "warning" | "destructive"> = {
  new: "info",
  contacted: "secondary",
  booked: "success",
  won: "success",
  lost: "destructive",
};

const SA_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false });
const SA_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long" });
const SA_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "numeric", hour12: false });

function greeting(now: Date) {
  const hour = Number(SA_HOUR.format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string, now: Date) {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Supabase returns an embedded to-one row as an object or a one-item array
// depending on how it infers the relationship.
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DashboardPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const now = new Date();
  const today = localDateISO(now);
  const dayStart = localToUtcDate(today, "00:00").toISOString();
  const dayEnd = localToUtcDate(addDays(today, 1), "00:00").toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 86400000).toISOString();

  const [activeToday, needYou, newLeads, upcoming, todaysBookings, recentChats, recentLeads] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("last_message_at", dayStart),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "human"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", weekAgo),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("starts_at", now.toISOString())
      .lt("starts_at", weekAhead),
    supabase
      .from("bookings")
      .select("id, name, starts_at, status, services(name)")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .order("starts_at")
      .limit(6),
    supabase
      .from("conversations")
      .select("id, channel, status, external_id, last_message_at, contacts(name)")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false })
      .limit(5),
    supabase
      .from("leads")
      .select("id, name, interest, status, source, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const needYouCount = needYou.count ?? 0;
  const kpis: { label: string; value: number; hint: string; href: string; icon: LucideIcon; tone: Tone; warn?: boolean }[] = [
    { label: "Conversations today", value: activeToday.count ?? 0, hint: "Website + WhatsApp", href: "/dashboard/conversations", icon: MessageSquareIcon, tone: "indigo" },
    { label: "Waiting for you", value: needYouCount, hint: needYouCount ? "Asked for a person" : "All handled by AI", href: "/dashboard/conversations", icon: HandIcon, tone: "orange", warn: needYouCount > 0 },
    { label: "New leads · 7 days", value: newLeads.count ?? 0, hint: "Captured by your AI", href: "/dashboard/leads", icon: UsersIcon, tone: "pink" },
    { label: "Bookings · next 7 days", value: upcoming.count ?? 0, hint: "Not counting cancelled", href: "/dashboard/bookings", icon: CalendarIcon, tone: "teal" },
  ];

  const bookings = todaysBookings.data ?? [];
  const chats = recentChats.data ?? [];
  const leads = recentLeads.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:p-8">
      <header className="mb-8 flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">{SA_DATE.format(now)}</span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting(now)}</h1>
      </header>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <Link
            key={k.label}
            href={k.href}
            style={{ "--i": i } as React.CSSProperties}
            className="surface surface-lift rise-in group flex flex-col gap-3 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <div className="flex items-center justify-between">
              <div
                className={cn("icon-tile size-10 rounded-xl", TONE[k.tone].tile)}
                style={{ "--tile-glow": TONE[k.tone].glow } as React.CSSProperties}
              >
                <k.icon className="size-[18px]" />
              </div>
              <ArrowUpRightIcon className="size-4 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 motion-reduce:transform-none" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-3xl leading-none font-bold tracking-tight tabular-nums">{k.value}</span>
              <Badge variant={k.warn ? "warning" : "secondary"}>{k.hint}</Badge>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="rise-in gap-3" style={{ "--i": 4 } as React.CSSProperties}>
          <div className="flex items-center justify-between px-5">
            <h2 className="text-base font-semibold tracking-tight">Today’s bookings</h2>
            <Link href="/dashboard/bookings" className="text-sm font-semibold text-primary hover:underline dark:text-indigo-300">
              All bookings
            </Link>
          </div>
          <ul className="flex flex-col px-2">
            {bookings.map((b) => {
              const service = one(b.services as { name: string } | { name: string }[] | null);
              return (
                <li key={b.id}>
                  <Link
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-accent/50"
                  >
                    <span className="w-12 text-sm font-semibold tabular-nums">{SA_TIME.format(new Date(b.starts_at))}</span>
                    <span className="h-9 w-1 shrink-0 rounded-full bg-[linear-gradient(180deg,#818CF8,#4F46E5)]" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{service?.name ?? "Appointment"}</span>
                      <span className="truncate text-xs text-muted-foreground">{b.name}</span>
                    </span>
                    <Badge variant={b.status === "pending" ? "warning" : "success"}>{STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge>
                  </Link>
                </li>
              );
            })}
            {!bookings.length && <EmptyRow text="Nothing booked for today yet." />}
          </ul>
        </Card>

        <Card className="rise-in gap-3" style={{ "--i": 5 } as React.CSSProperties}>
          <div className="flex items-center justify-between px-5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold tracking-tight">Latest conversations</h2>
              <span className="live-dot" aria-hidden />
            </div>
            <Link href="/dashboard/conversations" className="text-sm font-semibold text-primary hover:underline dark:text-indigo-300">
              Open inbox
            </Link>
          </div>
          <ul className="flex flex-col px-2">
            {chats.map((c) => {
              const contact = one(c.contacts as { name: string | null } | { name: string | null }[] | null);
              const name = contact?.name || (c.channel === "whatsapp" ? `+${c.external_id}` : "Website visitor");
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/conversations/${c.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-accent/50"
                  >
                    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#E0E7FF,#C7D2FE)] text-sm font-semibold text-indigo-950">
                      {name.replace(/^\+/, "").slice(0, 1).toUpperCase()}
                      <span
                        className={cn(
                          "absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card",
                          c.channel === "whatsapp" ? "bg-[#25D366]" : "bg-indigo-500",
                        )}
                        title={c.channel === "whatsapp" ? "WhatsApp" : "Website"}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{name}</span>
                      <span className="text-xs text-muted-foreground">{c.channel === "whatsapp" ? "WhatsApp" : "Website chat"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(c.last_message_at, now)}</span>
                    <Badge variant={c.status === "human" ? "warning" : c.status === "closed" ? "secondary" : "info"}>
                      {c.status === "human" ? "Needs you" : c.status === "closed" ? "Closed" : "AI"}
                    </Badge>
                  </Link>
                </li>
              );
            })}
            {!chats.length && <EmptyRow text="No conversations yet. They’ll appear here as soon as someone chats." />}
          </ul>
        </Card>
      </section>

      <Card className="rise-in mt-4 gap-3" style={{ "--i": 6 } as React.CSSProperties}>
        <div className="flex items-center justify-between px-5">
          <h2 className="text-base font-semibold tracking-tight">New leads</h2>
          <Link href="/dashboard/leads" className="text-sm font-semibold text-primary hover:underline dark:text-indigo-300">
            All leads
          </Link>
        </div>
        <ul className="flex flex-col px-2">
          {leads.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-accent/50">
              <span className="min-w-32 flex-1 text-sm font-semibold">{l.name ?? "Unnamed"}</span>
              <span className="min-w-40 flex-[2] truncate text-sm text-muted-foreground">{l.interest ?? "—"}</span>
              <span className="w-24 text-xs text-muted-foreground">{l.source === "whatsapp" ? "WhatsApp" : "Website"}</span>
              <Badge variant={LEAD_BADGE[l.status] ?? "secondary"} className="capitalize">
                {l.status}
              </Badge>
            </li>
          ))}
          {!leads.length && <EmptyRow text="No leads yet. Your AI saves one whenever a visitor shares their details." />}
        </ul>
      </Card>

      <section aria-label="Shortcuts" className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Set up</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SHORTCUTS.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              style={{ "--i": 7 + i } as React.CSSProperties}
              className="surface surface-lift rise-in flex items-center gap-3.5 rounded-2xl p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className={cn("icon-tile size-10 shrink-0 rounded-xl", TONE[s.tone].tile)}
                style={{ "--tile-glow": TONE[s.tone].glow } as React.CSSProperties}
              >
                <s.icon className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{s.title}</span>
                <span className="truncate text-xs text-muted-foreground">{s.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <li className="px-3 py-6 text-center text-sm text-muted-foreground">{text}</li>;
}
