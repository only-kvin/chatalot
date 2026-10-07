import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InboxIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ThemeFlipButton } from "@/components/theme/theme-switcher";
import { parseTheme, THEME_COOKIE } from "@/components/theme/theme";
import { AiPanel, Kpis, LiveConversations, NewLeads, TodaysBookings } from "./_overview/sections";
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
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

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

      <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Suspense fallback={<KpisSkeleton />}>
          <Kpis tenantId={tenantId} />
        </Suspense>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-4">
        <Panel title="Today’s bookings" link={{ href: "/dashboard/bookings", label: "View calendar" }}>
          <Suspense fallback={<RowsSkeleton />}>
            <TodaysBookings tenantId={tenantId} />
          </Suspense>
        </Panel>
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
            <AiPanel tenantId={tenantId} />
          </Suspense>
        </Panel>
      </section>
    </div>
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
