import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRightIcon, InboxIcon, LockIcon, SparklesIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { FEATURE_INFO, FEATURES, PLAN_LABEL, planFor } from "@/lib/plans";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ThemeFlipButton } from "@/components/theme/theme-switcher";
import { parseTheme, THEME_COOKIE } from "@/components/theme/theme";
import { AiPanel, Kpis, LiveConversations, NewLeads, TodaysBookings } from "./_overview/sections";
import { OnboardingChecklist } from "./_overview/onboarding";
import { KpisSkeleton, PeopleSkeleton, RowsSkeleton, TableSkeleton } from "./_overview/skeletons";

const TODAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "numeric", hour12: false });

function greeting(now: Date): string {
  const hour = Number(HOUR.format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage() {
  const current = await currentTenantFeatures();
  if (!current) redirect("/");
  const { tenantId, features } = current;
  const bookingsOn = features.bookings === "on";

  const supabase = await createClient();
  const [{ data: config }, cookieStore] = await Promise.all([
    supabase.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const now = new Date();
  const name = config?.business_name;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pt-7 pb-12 sm:px-[clamp(16px,3vw,40px)]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">{TODAY.format(now)}</span>
          <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.025em]">
            {greeting(now)}
            {name && <span className="text-muted-foreground">, {name}</span>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ThemeFlipButton serverTheme={theme} />
          <Link href="/dashboard/conversations" className={buttonVariants({ size: "lg" })}>
            <InboxIcon />
            Open inbox
          </Link>
        </div>
      </header>

      {/* Hidden once every step is done, so no skeleton: it just appears. */}
      <Suspense fallback={null}>
        <OnboardingChecklist tenantId={tenantId} bookings={bookingsOn} />
      </Suspense>

      <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Suspense fallback={<KpisSkeleton />}>
          <Kpis tenantId={tenantId} bookings={bookingsOn} />
        </Suspense>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-4">
        {bookingsOn && (
          <Panel title="Today’s bookings" link={{ href: "/dashboard/bookings", label: "View calendar" }}>
            <Suspense fallback={<RowsSkeleton />}>
              <TodaysBookings tenantId={tenantId} />
            </Suspense>
          </Panel>
        )}
        <Panel
          title="Live conversations"
          live
          link={{ href: "/dashboard/conversations", label: "Open inbox" }}
        >
          <Suspense fallback={<PeopleSkeleton />}>
            <LiveConversations tenantId={tenantId} />
          </Suspense>
        </Panel>
      </section>

      <section className="flex flex-wrap gap-4">
        <Panel
          title="New leads"
          link={{ href: "/dashboard/leads", label: "All leads" }}
          className="min-w-0 flex-[2_1_520px]"
        >
          <Suspense fallback={<TableSkeleton />}>
            <NewLeads tenantId={tenantId} />
          </Suspense>
        </Panel>
        <Panel
          title="AI receptionist"
          className="flex-[1_1_320px] from-card to-[#f4f3ff] dark:from-[#1b1b22] dark:to-[#1c1a30]"
        >
          <Suspense fallback={<RowsSkeleton />}>
            <AiPanel tenantId={tenantId} features={features} />
          </Suspense>
        </Panel>
      </section>

      <MoreWithPlan locked={FEATURES.filter((f) => features[f] === "locked")} />
    </div>
  );
}

// The one upsell on the Overview: features on a higher plan, each linking to
// its upgrade page. Nothing when the plan already has everything.
function MoreWithPlan({ locked }: { locked: (typeof FEATURES)[number][] }) {
  if (!locked.length) return null;
  const plan = planFor(locked[0]);
  return (
    <Card className="gap-4 px-[22px] py-[22px] sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-145 from-[#7c76f7] to-[#4338ca] shadow-[0_6px_14px_-6px_rgb(67_56_202/0.55)]">
        <SparklesIcon className="size-5 text-white" />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Do more with {PLAN_LABEL[plan]}</h2>
        <p className="text-[13px] text-muted-foreground">{FEATURE_INFO[locked[0]].pitch}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {locked.map((f) => (
          <Link
            key={f}
            href={`/dashboard/upgrade/${f}`}
            className="group/more flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LockIcon className="size-3" />
            {FEATURE_INFO[f].title}
            <ArrowRightIcon className="size-3 transition-transform group-hover/more:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

function Panel({
  title,
  link,
  live,
  className,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  live?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`gap-4 px-[22px] py-[22px] ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          {live && <span className="live-dot" aria-hidden />}
        </div>
        {link && (
          <Link href={link.href} className="text-[13px] font-semibold text-link hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
