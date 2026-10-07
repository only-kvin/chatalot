import Link from "next/link";
import {
  BotIcon,
  CalendarIcon,
  MessageSquareIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { addDays, formatLocalTime, localDateISO, localToUtcDate, todayLocalISO } from "@/lib/time";
import { STATUS_LABEL, statusVariant, type BookingStatus } from "@/lib/bookings/labels";
import { CONVERSATION_LABEL, conversationTone, leadTone } from "@/lib/ui/status-tones";
import { formatPhone } from "@/lib/contacts/phone";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkline } from "./sparkline";
import type { Features } from "@/lib/plans";
import { AiSwitches } from "./ai-switches";

// Each section fetches its own data so the Overview can stream them in
// independently (see the Suspense boundaries in ../page.tsx). Every query
// filters by tenant_id explicitly, on top of RLS.

type Tone = "new" | "neutral" | "success" | "warning" | "danger";

// The last 7 SA calendar days, oldest first, ending today.
function lastSevenDays(): string[] {
  const today = todayLocalISO();
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}

function countByDay(days: string[], instants: string[]): number[] {
  const counts = new Map(days.map((d) => [d, 0]));
  for (const t of instants) {
    const day = localDateISO(new Date(t));
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1);
  }
  return days.map((d) => counts.get(d)!);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
}

// ---------------------------------------------------------------------------
// Key numbers
// ---------------------------------------------------------------------------

type Kpi = {
  label: string;
  value: string;
  href: string;
  icon: LucideIcon;
  tile: string;
  line: string;
  chip: { text: string; tone: Tone } | null;
  trend: number[] | null;
};

export async function Kpis({ tenantId, bookings: showBookings }: { tenantId: string; bookings: boolean }) {
  const supabase = await createClient();
  const days = lastSevenDays();
  const weekStart = localToUtcDate(days[0], "00:00").toISOString();
  const twoWeeksStart = localToUtcDate(addDays(days[0], -7), "00:00").toISOString();
  const todayStart = localToUtcDate(days[6], "00:00");
  const weekAhead = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [inbound, leads, bookings, active] = await Promise.all([
    // Customer messages this week: a conversation "happened" on each day
    // its customer wrote in.
    supabase
      .from("messages")
      .select("conversation_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("role", "user")
      .gte("created_at", weekStart)
      .limit(5000),
    supabase.from("leads").select("created_at").eq("tenant_id", tenantId).gte("created_at", twoWeeksStart),
    supabase
      .from("bookings")
      .select("starts_at, status")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("starts_at", new Date().toISOString())
      .lt("starts_at", weekAhead),
    supabase
      .from("conversations")
      .select("status")
      .eq("tenant_id", tenantId)
      .gte("last_message_at", weekStart),
  ]);

  // Distinct conversations per day.
  const perDay = new Map(days.map((d) => [d, new Set<string>()]));
  for (const m of inbound.data ?? []) perDay.get(localDateISO(new Date(m.created_at)))?.add(m.conversation_id);
  const convTrend = days.map((d) => perDay.get(d)!.size);
  const convToday = convTrend[6];

  const leadRows = leads.data ?? [];
  const leadsThisWeek = leadRows.filter((l) => l.created_at >= weekStart);
  const leadsLastWeek = leadRows.length - leadsThisWeek.length;

  const bookingRows = bookings.data ?? [];
  const pending = bookingRows.filter((b) => b.status === "pending").length;
  const aheadDays = Array.from({ length: 7 }, (_, i) => addDays(days[6], i));

  const conversations = active.data ?? [];
  const needYou = conversations.filter((c) => c.status === "human").length;
  const handled = conversations.length
    ? Math.round(((conversations.length - needYou) / conversations.length) * 100)
    : null;

  const kpis: Kpi[] = [
    {
      label: "Conversations today",
      value: String(convToday),
      href: "/dashboard/conversations",
      icon: MessageSquareIcon,
      tile: "from-[#7c76f7] to-[#4338ca] shadow-[0_6px_14px_-6px_rgb(67_56_202/0.55)]",
      line: "text-chart-1",
      chip: { text: `${signed(convToday - convTrend[5])} vs yesterday`, tone: convToday >= convTrend[5] ? "success" : "neutral" },
      trend: convTrend,
    },
    {
      label: "New leads · 7 days",
      value: String(leadsThisWeek.length),
      href: "/dashboard/leads",
      icon: UsersIcon,
      tile: "from-[#f9a8d4] to-[#be185d] shadow-[0_6px_14px_-6px_rgb(190_24_93/0.45)]",
      line: "text-chart-2",
      chip: {
        text: `${signed(leadsThisWeek.length - leadsLastWeek)} vs last week`,
        tone: leadsThisWeek.length >= leadsLastWeek ? "success" : "neutral",
      },
      trend: countByDay(days, leadsThisWeek.map((l) => l.created_at)),
    },
    {
      label: "Bookings · next 7 days",
      value: String(bookingRows.length),
      href: pending ? "/dashboard/bookings?tab=pending" : "/dashboard/bookings",
      icon: CalendarIcon,
      tile: "from-[#5eead4] to-[#0f766e] shadow-[0_6px_14px_-6px_rgb(15_118_110/0.45)]",
      line: "text-chart-3",
      chip: pending ? { text: `${pending} to approve`, tone: "warning" } : null,
      trend: countByDay(aheadDays, bookingRows.map((b) => b.starts_at)),
    },
    {
      label: "Handled by AI · 7 days",
      value: handled === null ? "—" : `${handled}%`,
      href: "/dashboard/conversations",
      icon: BotIcon,
      tile: "from-[#fdba74] to-[#c2410c] shadow-[0_6px_14px_-6px_rgb(194_65_12/0.45)]",
      line: "text-chart-4",
      chip: needYou ? { text: `${needYou} need${needYou === 1 ? "s" : ""} you`, tone: "warning" } : null,
      trend: null,
    },
  ];

  return (
    <>
      {kpis.filter((k) => showBookings || k.icon !== CalendarIcon).map((k, i) => (
        <Link key={k.label} href={k.href} className="fade-up rounded-[20px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50" style={{ "--i": i } as React.CSSProperties}>
          <Card lift className="h-[156px] gap-3 px-5">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex size-10 items-center justify-center rounded-xl bg-linear-145 ${k.tile}`}>
                <k.icon className="size-5 text-white" />
              </span>
              {k.chip && <Badge variant={k.chip.tone}>{k.chip.text}</Badge>}
            </div>
            <span className="text-[13px] font-medium text-muted-foreground">{k.label}</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[30px] leading-none font-bold tracking-[-0.02em] tabular-nums">{k.value}</span>
              {k.trend && <Sparkline values={k.trend} className={k.line} />}
            </div>
          </Card>
        </Link>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Today's bookings
// ---------------------------------------------------------------------------

const STAFF_COLOURS = ["#6366f1", "#14b8a6", "#f97316", "#ec4899", "#0ea5e9", "#a855f7"];

export async function TodaysBookings({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const today = todayLocalISO();
  const { data } = await supabase
    .from("bookings")
    .select("id, name, starts_at, status, services(name), staff(name)")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("starts_at", localToUtcDate(today, "00:00").toISOString())
    .lt("starts_at", localToUtcDate(addDays(today, 1), "00:00").toISOString())
    .order("starts_at")
    .limit(8);
  const bookings = data ?? [];

  if (!bookings.length) {
    return <Empty>No bookings today.</Empty>;
  }

  return (
    <div className="flex flex-col gap-1">
      {bookings.map((b, i) => {
        const service = (b.services as unknown as { name: string } | null)?.name ?? "Appointment";
        const staff = (b.staff as unknown as { name: string } | null)?.name;
        return (
          <Link
            key={b.id}
            href={`/dashboard/bookings/${b.id}`}
            className="fade-up flex items-center gap-3.5 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-hover"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="w-12 text-sm font-semibold tabular-nums">{formatLocalTime(b.starts_at)}</span>
            <span className="w-1 self-stretch rounded" style={{ background: STAFF_COLOURS[i % STAFF_COLOURS.length] }} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{service}</span>
              <span className="truncate text-[13px] text-muted-foreground">
                {b.name}
                {staff && ` · with ${staff}`}
              </span>
            </span>
            <Badge variant={statusVariant(b.status)}>{STATUS_LABEL[b.status as BookingStatus] ?? b.status}</Badge>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live conversations
// ---------------------------------------------------------------------------

const AVATAR_BG = ["#e0e7ff", "#dcfce7", "#ffedd5", "#fce7f3", "#e0f2fe"];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

function ago(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes > -1) return "now";
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export async function LiveConversations({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, channel, external_id, status, last_message_at, contacts(name)")
    .eq("tenant_id", tenantId)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(5);
  const conversations = data ?? [];

  if (!conversations.length) {
    return <Empty>No conversations yet. They&apos;ll appear here as customers write in.</Empty>;
  }

  // The latest customer message in each, for the preview line.
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, content")
    .eq("tenant_id", tenantId)
    .eq("role", "user")
    .in("conversation_id", conversations.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(50);
  const preview = new Map<string, string>();
  for (const m of messages ?? []) if (!preview.has(m.conversation_id)) preview.set(m.conversation_id, m.content);

  return (
    <div className="flex flex-col gap-1">
      {conversations.map((c, i) => {
        const contact = (c.contacts as unknown as { name: string | null } | null)?.name;
        const name = contact || (c.channel === "whatsapp" ? formatPhone(c.external_id) : "Website visitor");
        return (
          <Link
            key={c.id}
            href={`/dashboard/conversations/${c.id}`}
            className="fade-up flex items-center gap-3 rounded-[14px] p-2.5 transition-colors hover:bg-hover"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span
              className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#1d1d1f]"
              style={{ background: AVATAR_BG[i % AVATAR_BG.length] }}
            >
              {contact ? contact.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?" : c.channel === "whatsapp" ? "#" : "W"}
              <span
                className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-2 border-card"
                style={{ background: c.channel === "whatsapp" ? "#25d366" : "#6366f1" }}
                title={c.channel === "whatsapp" ? "WhatsApp" : "Website chat"}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex justify-between gap-2">
                <span className="truncate text-sm font-semibold">{name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{ago(c.last_message_at)}</span>
              </span>
              <span className="truncate text-[13px] text-muted-foreground">{preview.get(c.id) ?? "—"}</span>
            </span>
            <Badge variant={conversationTone(c.status)}>{CONVERSATION_LABEL[c.status] ?? c.status}</Badge>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New leads
// ---------------------------------------------------------------------------

const SOURCE: Record<string, string> = {
  web: "Website chat",
  whatsapp: "WhatsApp",
  schedule_widget: "Booking widget",
  appointment_widget: "Appointment widget",
  contact_widget: "Contact form",
  registration_widget: "Sign-up form",
};

export async function NewLeads({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, name, interest, source, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);
  const leads = data ?? [];

  if (!leads.length) {
    return <Empty>No leads yet. Your AI receptionist saves them as visitors share their details.</Empty>;
  }

  const cols = "grid grid-cols-[1.3fr_1.6fr_1fr_0.9fr] items-center gap-3";
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[520px] flex-col">
        <div className={`${cols} border-b px-3 pb-2.5 text-xs font-semibold text-muted-foreground`}>
          <span>Name</span>
          <span>Interested in</span>
          <span>Source</span>
          <span>Status</span>
        </div>
        {leads.map((l, i) => (
          <div
            key={l.id}
            className={`${cols} fade-up rounded-xl p-3 text-sm transition-colors hover:bg-hover`}
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="truncate font-semibold">{l.name}</span>
            <span className="truncate text-foreground/80">{l.interest}</span>
            <span className="text-muted-foreground">{SOURCE[l.source] ?? l.source}</span>
            <span>
              <Badge variant={leadTone(l.status)} className="capitalize">
                {l.status}
              </Badge>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI receptionist switches
// ---------------------------------------------------------------------------

export async function AiPanel({ tenantId, features }: { tenantId: string; features: Features }) {
  const supabase = await createClient();
  const [{ data: config }, { count: whatsappChannels }] = await Promise.all([
    supabase
      .from("agent_configs")
      .select("web_ai_enabled, whatsapp_ai_enabled, lead_email_enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "whatsapp")
      .eq("status", "active"),
  ]);

  return (
    <AiSwitches
      webChat={features.web_chat}
      whatsapp={features.whatsapp}
      whatsappConnected={(whatsappChannels ?? 0) > 0}
      initial={{
        web_ai_enabled: config?.web_ai_enabled ?? true,
        whatsapp_ai_enabled: config?.whatsapp_ai_enabled ?? true,
        lead_email_enabled: config?.lead_email_enabled ?? true,
      }}
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[14px] bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
