"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, ChevronDownIcon, MenuIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "./logo";
import {
  BUSINESS_TYPE_LINKS,
  FEATURE_GROUPS,
  RESOURCE_LINKS,
  type NavGroup,
  type NavLink,
} from "@/lib/marketing/nav";

type MenuId = "features" | "types" | "resources";

const MENUS: { id: MenuId; label: string }[] = [
  { id: "features", label: "Features" },
  { id: "types", label: "Business type" },
  { id: "resources", label: "Resources" },
];

// How long the pointer can leave a menu before it closes, so a diagonal move
// from the trigger to the panel doesn't snap it shut.
const HOVER_CLOSE_MS = 140;

export function SiteHeader() {
  const [open, setOpen] = useState<MenuId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // Set when hovering opened the menu, so the click that usually follows
  // keeps it open instead of toggling it straight back shut.
  const openedByHover = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Esc closes the open menu and hands focus back to its trigger; a click
  // anywhere outside the header closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      document.getElementById(`menu-trigger-${open}`)?.focus();
      setOpen(null);
    };
    const onPointer = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(null), HOVER_CLOSE_MS);
  };

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "sticky top-0 z-40 border-b bg-white/85 backdrop-blur-xl transition-[border-color,box-shadow] duration-200",
          scrolled || open ? "border-border shadow-[0_1px_12px_-6px_rgb(17_17_26/0.12)]" : "border-transparent",
        )}
        // Leaving the whole header (bar + panel) with the mouse closes the menu.
        onPointerLeave={(e) => e.pointerType === "mouse" && open && scheduleClose()}
        onPointerEnter={cancelClose}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 md:px-6">
          <Logo />

          <nav aria-label="Main" className="hidden flex-1 lg:block">
            <ul className="flex items-center gap-1">
              {MENUS.map((m) => (
                <li
                  key={m.id}
                  // Leaving the trigger and its panel by keyboard closes it.
                  onBlur={(e) => {
                    if (open === m.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(null);
                  }}
                >
                  <button
                    id={`menu-trigger-${m.id}`}
                    type="button"
                    aria-expanded={open === m.id}
                    aria-controls={`menu-panel-${m.id}`}
                    onClick={() => {
                      if (open === m.id && openedByHover.current) {
                        openedByHover.current = false;
                        return;
                      }
                      openedByHover.current = false;
                      setOpen(open === m.id ? null : m.id);
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      cancelClose();
                      if (open !== m.id) openedByHover.current = true;
                      setOpen(m.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowDown") return;
                      e.preventDefault();
                      setOpen(m.id);
                      // Wait for the panel to render, then focus its first link.
                      requestAnimationFrame(() =>
                        document.querySelector<HTMLAnchorElement>(`#menu-panel-${m.id} a`)?.focus(),
                      );
                    }}
                    className={cn(
                      "flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium text-foreground/80 transition-colors outline-none hover:bg-black/[0.04] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      open === m.id && "bg-black/[0.04] text-foreground",
                    )}
                  >
                    {m.label}
                    <ChevronDownIcon
                      aria-hidden
                      className={cn("size-3.5 opacity-60 transition-transform duration-200 motion-snap", open === m.id && "rotate-180")}
                    />
                  </button>
                  {open === m.id && (
                    // Absolute against the header (the <li> isn't positioned), so
                    // it spans the full width, yet sits right after its trigger
                    // in tab order.
                    <div
                      id={`menu-panel-${m.id}`}
                      className="menu-enter absolute inset-x-0 top-full border-b border-border bg-white shadow-[0_24px_48px_-24px_rgb(17_17_26/0.25)]"
                      onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(null)}
                    >
                      <div className="mx-auto max-w-7xl px-6 py-8">
                        <MenuPanel id={m.id} />
                      </div>
                    </div>
                  )}
                </li>
              ))}
              <li>
                <Link
                  href="/pricing"
                  className="flex h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground/80 transition-colors outline-none hover:bg-black/[0.04] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Pricing
                </Link>
              </li>
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground/80 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex"
            >
              Staff sign in
            </Link>
            <Link href="/demo" className={cn(buttonVariants(), "hidden sm:inline-flex")}>
              Get a demo
            </Link>
            <button
              id="mobile-menu-trigger"
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileOpen(true)}
              className="flex size-10 items-center justify-center rounded-lg outline-none hover:bg-black/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
            >
              <MenuIcon className="size-5" aria-hidden />
            </button>
          </div>
        </div>

      </header>
      {/* Outside the header: its backdrop blur would otherwise make it the
          containing block for this fixed overlay. */}
      {mobileOpen && <MobileMenu onClose={closeMobile} />}
    </>
  );
}

function MenuPanel({ id }: { id: MenuId }) {
  if (id === "features") {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-8">
          {FEATURE_GROUPS.map((g) => (
            <GroupColumn key={g.title} group={g} />
          ))}
        </div>
        <PanelFooter href="/features" label="See every feature" />
      </div>
    );
  }
  if (id === "types") {
    return (
      <ul className="grid grid-cols-3 gap-2">
        {BUSINESS_TYPE_LINKS.map((l) => (
          <li key={l.href}>
            <ResourceLink link={l} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-2">
      {RESOURCE_LINKS.map((l) => (
        <li key={l.href}>
          <ResourceLink link={l} />
        </li>
      ))}
    </ul>
  );
}

function GroupColumn({ group }: { group: NavGroup }) {
  return (
    <div className="flex flex-col gap-3">
      {group.href ? (
        <Link href={group.href} className="text-[13px] font-semibold tracking-[-0.005em] text-foreground hover:text-link">
          {group.title}
        </Link>
      ) : (
        <p className="text-[13px] font-semibold">{group.title}</p>
      )}
      <ul className="flex flex-col gap-2">
        {group.links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className={cn(
                "block rounded-md text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground",
                l.label.startsWith("All ") && "font-medium text-link hover:text-link",
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourceLink({ link }: { link: NavLink }) {
  return (
    <Link href={link.href} className="flex flex-col gap-0.5 rounded-xl p-3 transition-colors hover:bg-accent">
      <span className="text-sm font-semibold">{link.label}</span>
      {link.description && <span className="text-[13px] text-muted-foreground">{link.description}</span>}
    </Link>
  );
}

function PanelFooter({ href, label }: { href: string; label: string }) {
  return (
    <div className="border-t border-border pt-4">
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
        {label}
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

// Full-screen menu for phones and tablets. Traps focus while open, Esc or the
// close button dismisses it, and the page behind it doesn't scroll.
function MobileMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<MenuId | null>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("[data-close]")?.focus();
    const trigger = document.getElementById("mobile-menu-trigger");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const focusable = ref.current.querySelectorAll<HTMLElement>("a, button");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [onClose]);

  const groups: Record<MenuId, NavGroup[]> = {
    features: FEATURE_GROUPS,
    types: [{ title: "", links: BUSINESS_TYPE_LINKS }],
    resources: [{ title: "", links: RESOURCE_LINKS }],
  };

  return (
    <div
      ref={ref}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="menu-enter fixed inset-0 z-50 flex flex-col bg-white lg:hidden"
      onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <Logo />
        <button
          type="button"
          data-close
          aria-label="Close menu"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-lg outline-none hover:bg-black/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <XIcon className="size-5" aria-hidden />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto overscroll-contain px-4 py-2">
        <ul className="divide-y divide-border">
          {MENUS.map((m) => {
            const expanded = section === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`mobile-section-${m.id}`}
                  onClick={() => setSection(expanded ? null : m.id)}
                  className="flex w-full items-center justify-between py-4 text-left text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {m.label}
                  <ChevronDownIcon
                    aria-hidden
                    className={cn("size-4 opacity-60 transition-transform duration-200 motion-snap", expanded && "rotate-180")}
                  />
                </button>
                {expanded && (
                  <div id={`mobile-section-${m.id}`} className="flex flex-col gap-5 pb-5">
                    {groups[m.id].map((g) => (
                      <div key={g.title || "all"} className="flex flex-col gap-2">
                        {g.title &&
                          (g.href ? (
                            <Link href={g.href} className="text-sm font-semibold text-link">
                              {g.title}
                            </Link>
                          ) : (
                            <p className="text-sm font-semibold">{g.title}</p>
                          ))}
                        <ul className="flex flex-col">
                          {g.links.map((l) => (
                            <li key={l.href + l.label}>
                              <Link href={l.href} className="block py-1.5 text-[15px] text-muted-foreground">
                                {l.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          <li>
            <Link href="/pricing" className="block py-4 text-base font-semibold">
              Pricing
            </Link>
          </li>
        </ul>
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link href="/demo" className={buttonVariants({ size: "lg" })}>
          Get a demo
        </Link>
        <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Staff sign in
        </Link>
      </div>
    </div>
  );
}
