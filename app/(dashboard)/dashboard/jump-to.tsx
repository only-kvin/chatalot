"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { NavItem } from "./nav-items";

// "Jump to…" page search, also opened with Ctrl+K / ⌘K.
export function JumpTo({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  function openChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setCursor(0);
    }
  }

  function go(item: NavItem | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openChange(true)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-white/70 px-3.5 text-sm text-muted-foreground shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_1px_rgb(14_92_75/0.4),0_0_0_4px_rgb(14_92_75/0.12)] dark:bg-white/[0.04]"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="sr-only">Jump to a page</DialogTitle>
          <div className="flex items-center gap-2.5 border-b px-4">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(results[cursor]);
                }
              }}
              placeholder="Search pages…"
              aria-label="Search pages"
              role="combobox"
              aria-expanded
              aria-controls="jump-to-results"
              aria-activedescendant={results[cursor] ? `jump-${cursor}` : undefined}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id="jump-to-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No pages match.</li>}
            {results.map((item, i) => (
              <li
                key={item.href}
                id={`jump-${i}`}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  i === cursor ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
