"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import {
  applyTheme,
  clearTheme,
  readThemePref,
  setThemePref,
  subscribeThemePref,
  type ThemePref,
} from "@/lib/theme";

const OPTIONS: { value: ThemePref; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "Auto", icon: MonitorIcon },
];

// The server can't know the saved choice, so it renders "system"; the client
// snapshot takes over right after hydration. The sliding pill is positioned
// from <html data-theme-pref> (set by the inline script) so it never jumps.
const getServerSnapshot = (): ThemePref => "system";

export function useThemePref() {
  return useSyncExternalStore(subscribeThemePref, readThemePref, getServerSnapshot);
}

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const pref = useThemePref();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="theme-seg relative grid shrink-0 grid-cols-3 rounded-xl bg-muted p-[3px] ring-1 ring-border/60"
    >
      <span
        aria-hidden
        className="theme-seg-pill pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/3)] rounded-[9px] bg-card shadow-[0_1px_2px_oklch(0_0_0/10%),0_4px_10px_-4px_oklch(0_0_0/18%)] transition-transform duration-[380ms] ease-(--ease-spring) motion-reduce:transition-none dark:bg-zinc-700"
      />
      {OPTIONS.map((o) => {
        const selected = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compact ? o.label : undefined}
            onClick={() => setThemePref(o.value)}
            className={cn(
              "relative z-10 flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] text-xs font-medium transition-colors duration-200",
              compact ? "w-9" : "px-2",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <o.icon
              className={cn(
                "size-3.5 transition-transform duration-[450ms] ease-(--ease-spring) motion-reduce:transition-none",
                selected && "-rotate-[20deg] scale-110 motion-reduce:transform-none",
              )}
            />
            {!compact && o.label}
          </button>
        );
      })}
    </div>
  );
}

// Applies the saved theme when arriving by client-side navigation (the inline
// script only runs on full page loads) and drops it when leaving the app, so
// public pages stay light.
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readThemePref());
    return () => clearTheme();
  }, []);
  return null;
}
