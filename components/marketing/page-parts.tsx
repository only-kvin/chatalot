import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import { MARKETING_WIDGET_KEY, SIGNUP_OPEN } from "@/lib/marketing/site";

// Shared pieces for the marketing pages: the dark page hero, the closing
// call to action and the FAQ accordion.

export const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

const GLOW =
  "bg-[radial-gradient(900px_480px_at_80%_-10%,rgb(95_199_169/0.2),transparent_60%),radial-gradient(700px_420px_at_0%_110%,rgb(14_92_75/0.40),transparent_60%)]";

export function PageHero({
  eyebrow,
  title,
  intro,
  crumbs,
  aside,
  actions = true,
}: {
  eyebrow?: string;
  title: string;
  intro: React.ReactNode;
  // Breadcrumb trail above the title, e.g. [{ label: "Features", href: "/features" }].
  crumbs?: { label: string; href: string }[];
  // Shown beside the text on wide screens, below it on phones.
  aside?: React.ReactNode;
  actions?: boolean;
}) {
  return (
    <section className="relative overflow-hidden bg-[#0c1412] text-white">
      <div aria-hidden className={cn("pointer-events-none absolute inset-0", GLOW)} />
      <div
        className={cn(
          "relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-14 pb-16 md:px-6 md:pt-20 md:pb-24",
          aside && "lg:grid-cols-[1fr_1.05fr]",
        )}
      >
        <div className="flex flex-col items-start gap-5">
          {crumbs && (
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-[13px] text-white/55">
                {crumbs.map((c) => (
                  <li key={c.href} className="flex items-center gap-1">
                    <Link href={c.href} className="hover:text-white">
                      {c.label}
                    </Link>
                    <ChevronRightIcon className="size-3.5" aria-hidden />
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {eyebrow && <p className="text-[13px] font-semibold tracking-wide text-[#5fc7a9] uppercase">{eyebrow}</p>}
          <h1 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance md:text-[56px]">{title}</h1>
          <div className="max-w-xl text-lg text-pretty text-white/70">{intro}</div>
          {actions && (
            <div className="fade-up flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants({ size: "lg" })}>
                Get a demo
              </Link>
              <Link
                href="/pricing"
                className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "text-white hover:bg-white/10 hover:text-white")}
              >
                See pricing
              </Link>
            </div>
          )}
        </div>
        {aside}
      </div>
    </section>
  );
}

export function CtaBand({ title = "Stop missing customers." }: { title?: string }) {
  return (
    <section className="relative overflow-hidden bg-[#0c1412] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_360px_at_50%_120%,rgb(95_199_169/0.2),transparent_65%)]"
      />
      <div data-reveal className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-24 text-center">
        <h2 className="text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance md:text-5xl">{title}</h2>
        <p className="max-w-xl text-lg text-white/70">
          See {BRAND_NAME} working with your own services in a 30-minute call.
          {MARKETING_WIDGET_KEY && ` Or ask the chat in the corner anything: that's ${BRAND_NAME} answering.`}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/demo" className={buttonVariants({ size: "lg" })}>
            Get a demo
          </Link>
          {SIGNUP_OPEN && (
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "text-white hover:bg-white/10 hover:text-white")}
            >
              Start free trial
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col divide-y divide-border rounded-[20px] border border-border bg-white shadow-card">
      {items.map((item) => (
        <details key={item.q} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-semibold outline-none focus-visible:text-link">
            {item.q}
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-lg leading-none transition-transform duration-200 group-open:rotate-45 motion-snap"
            >
              +
            </span>
          </summary>
          <p className="pb-5 text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

// A bullet list with the brand dot.
export function Points({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map((p) => (
        <li key={p} className="flex gap-2.5 text-[15px] leading-relaxed">
          <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}
