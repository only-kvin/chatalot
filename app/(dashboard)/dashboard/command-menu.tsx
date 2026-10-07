"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeftIcon, SearchIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { ADMIN_ITEM, NAV_GROUPS, type NavItem } from "./nav-items";

type Entry = NavItem & { group: string };

// ⌘K / Ctrl+K "jump to" menu: type a few letters, press Enter.
export function CommandMenu({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label ?? "General" })));
    if (isPlatformAdmin) all.push({ ...ADMIN_ITEM, group: "Platform" });
    return all;
  }, [isPlatformAdmin]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.label} ${e.keywords ?? ""}`.toLowerCase().includes(q));
  }, [entries, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setIndex(0);
    }
  }

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    router.push(entry.href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(results.length, 1);
      setIndex(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[index]);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger
        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl bg-card/70 px-3 text-sm text-muted-foreground ring-1 ring-border transition-shadow duration-200 hover:ring-primary/40 hover:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary),transparent_88%)]"
        aria-label="Jump to a page"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:inline">⌘K</kbd>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 dark:bg-black/50" />
        <DialogPrimitive.Popup className="surface fixed top-[15vh] left-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl bg-popover text-popover-foreground outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-top-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:data-open:zoom-in-100 motion-reduce:data-open:slide-in-from-top-0">
          <DialogPrimitive.Title className="sr-only">Jump to a page</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Search pages…"
              aria-label="Search pages"
              aria-controls="command-results"
              aria-activedescendant={results[index] ? `cmd-${results[index].href}` : undefined}
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id="command-results" ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-2">
            {results.map((entry, i) => (
              <li
                key={entry.href}
                id={`cmd-${entry.href}`}
                role="option"
                aria-selected={i === index}
                onMouseMove={() => setIndex(i)}
                onClick={() => go(entry)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-100",
                  i === index ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <entry.icon className="size-4 shrink-0 opacity-80" />
                <span className="flex-1 font-medium">{entry.label}</span>
                <span className="text-xs text-muted-foreground">{entry.group}</span>
                {i === index && <CornerDownLeftIcon className="size-3.5 text-muted-foreground" />}
              </li>
            ))}
            {!results.length && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No page matches “{query}”.</li>}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
