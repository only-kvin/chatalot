"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { cn } from "cn";
import { notificationPath, type NotificationType } from "@/lib/notifications";
import { markNotificationsReadAction } from "./notifications-actions";

type Item = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  conversationId: string | null;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 15_000;

// Desktop alerts need the browser Notification API, which some browsers
// (e.g. iOS Safari outside an installed app) don't have.
function desktopPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}
const TITLE_PREFIX = /^\(\d+\) /;

function hrefFor(item: Item): string {
  return notificationPath(item.type, item.conversationId);
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

// Dashboard alerts: unread badge, a list, the count in the tab title, and a
// desktop pop-up for new alerts while any dashboard tab is open (if allowed).
export function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Only read when the panel opens (client-side), so SSR markup isn't affected.
  const [permission, setPermission] = useState(desktopPermission);
  const seen = useRef<Set<string> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data: { unread: number; items: Item[] } = await res.json();

    // Pop up only alerts that arrived since the first load, not the backlog.
    if (seen.current) {
      const fresh = data.items.filter((i) => !i.read && !seen.current!.has(i.id));
      if (fresh.length && desktopPermission() === "granted") {
        for (const item of fresh) {
          const n = new Notification(item.title, { body: item.body, tag: item.id });
          n.onclick = () => {
            window.focus();
            router.push(hrefFor(item));
          };
        }
      }
    }
    seen.current = new Set(data.items.map((i) => i.id));
    setItems(data.items);
    setUnread(data.unread);
  }, [router]);

  useEffect(() => {
    // First check runs from a timer like the rest, rather than synchronously in the effect.
    const first = setTimeout(load, 0);
    // Background tabs keep polling only when they can actually pop up an alert.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" || desktopPermission() === "granted") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // "(2) Leads · ChatAlot" — pages set their own titles, so re-apply on navigation.
  useEffect(() => {
    const base = document.title.replace(TITLE_PREFIX, "");
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function openItem(item: Item) {
    setOpen(false);
    if (!item.read) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      setUnread((n) => Math.max(0, n - 1));
      markNotificationsReadAction([item.id]);
    }
    router.push(hrefFor(item));
  }

  async function markAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    await markNotificationsReadAction();
  }

  async function enableDesktopAlerts() {
    setPermission(await Notification.requestPermission());
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground"
      >
        <BellIcon className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          // Fixed, not absolute: the mobile nav strip scrolls horizontally and
          // would clip an absolutely positioned panel.
          className="fixed top-14 right-4 left-4 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg sm:left-auto sm:w-80 md:top-4 md:left-60 md:right-auto"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground">
                Mark all read
              </button>
            )}
          </div>

          {permission === "default" && (
            <button
              type="button"
              onClick={enableDesktopAlerts}
              className="border-b bg-indigo-50 px-4 py-2 text-left text-xs text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
            >
              Turn on desktop alerts, so you hear about new ones while this tab is in the background.
            </button>
          )}

          <ul className="overflow-y-auto">
            {/* Unread emergencies first; otherwise newest first, as loaded. */}
            {[...items]
              .sort((a, b) => Number(b.type === "urgent" && !b.read) - Number(a.type === "urgent" && !a.read))
              .map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left hover:bg-muted/60",
                    !item.read && "bg-indigo-50/60 dark:bg-indigo-950/40",
                    item.type === "urgent" && !item.read && "border-l-4 border-l-red-600 bg-red-50 dark:bg-red-950/50",
                  )}
                >
                  <span className={cn("flex items-center gap-2 text-sm font-medium", item.type === "urgent" && "text-red-700 dark:text-red-300")}>
                    {!item.read && (
                      <span className={cn("size-2 shrink-0 rounded-full", item.type === "urgent" ? "bg-red-600" : "bg-indigo-600")} aria-hidden />
                    )}
                    {item.title}
                  </span>
                  {item.body && <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>}
                  <span className="text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing yet. You&apos;ll see handoffs, new leads and bookings here.
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
