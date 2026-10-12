"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { GlobeIcon, MessageCircleIcon } from "lucide-react";
import { cn } from "cn";

export type InboxItem = {
  id: string;
  name: string;
  channel: "web" | "whatsapp";
  status: string;
  urgent: boolean;
  lastAt: string;
  preview: string;
};

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "needs", label: "Needs you", match: (c: InboxItem) => c.status === "human" || c.urgent },
  { id: "whatsapp", label: "WhatsApp", match: (c: InboxItem) => c.channel === "whatsapp" },
  { id: "web", label: "Website", match: (c: InboxItem) => c.channel === "web" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

// The list refreshes on its own while the tab is open, so new chats and
// replies appear without reloading.
const REFRESH_MS = 20_000;

const TZ = "Africa/Johannesburg";
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" });
const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

// "14:30" today, "Thu" this week, "12 Oct" before that.
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (DAY_KEY.format(d) === DAY_KEY.format(now)) return TIME.format(d);
  if (now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000) return WEEKDAY.format(d);
  return DATE.format(d);
}

function initials(name: string): string | null {
  if (!/^\p{L}/u.test(name)) return null;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, channel, className }: { name: string; channel: "web" | "whatsapp"; className?: string }) {
  const letters = initials(name);
  const Icon = channel === "whatsapp" ? MessageCircleIcon : GlobeIcon;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground",
        className,
      )}
    >
      {letters ?? <Icon className="size-4" />}
    </span>
  );
}

export function Inbox({ items, children }: { items: InboxItem[]; children: React.ReactNode }) {
  const active = useSelectedLayoutSegment();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("all");

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, items.filter(f.match).length])), [items]);
  const shown = items.filter(FILTERS.find((f) => f.id === filter)!.match);

  return (
    <div className="grid gap-4 md:h-[calc(100dvh-5.5rem)] md:min-h-[540px] md:grid-cols-[minmax(280px,340px)_1fr]">
      {/* The list. On phones it's hidden while a chat is open. */}
      <section
        aria-label="Conversations"
        className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card", active && "hidden md:flex")}
      >
        <div className="flex flex-col gap-3 border-b px-4 pt-4 pb-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Conversations</h1>
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  filter === f.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/40",
                )}
              >
                {f.label}
                {f.id === "needs" && counts.needs > 0 && <span className="ml-1 tabular-nums">{counts.needs}</span>}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((c) => {
            const needsYou = c.status === "human";
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  aria-current={active === c.id ? "page" : undefined}
                  className={cn(
                    "flex gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60",
                    active === c.id && "bg-accent hover:bg-accent",
                  )}
                >
                  <Avatar name={c.name} channel={c.channel} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when(c.lastAt)}</span>
                    </span>
                    <span className="truncate text-sm text-muted-foreground">{c.preview || "No messages yet"}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                      {c.urgent && <span className="rounded-full bg-tone-bad px-2 py-0.5 text-tone-bad-foreground">Urgent</span>}
                      {needsYou && (
                        <span className="rounded-full bg-tone-warn px-2 py-0.5 text-tone-warn-foreground">Needs you</span>
                      )}
                      <span className="text-muted-foreground">{c.channel === "whatsapp" ? "WhatsApp" : "Website"}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              {items.length === 0 ? "No conversations yet. They appear here as soon as someone messages you." : "Nothing here."}
            </li>
          )}
        </ul>
      </section>

      {/* The open chat (or a prompt to choose one). */}
      <section className={cn("min-h-0 min-w-0", !active && "hidden md:block")}>{children}</section>
    </div>
  );
}
