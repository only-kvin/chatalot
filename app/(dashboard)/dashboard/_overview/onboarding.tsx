import Link from "next/link";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/db/supabase-server";
import { loadSetupSteps } from "@/lib/onboarding";
import { Card } from "@/components/ui/card";

// The getting-started checklist on the Overview, for new businesses. Each
// step is worked out from what's actually set up, and the card disappears
// once everything is done. Every query filters by tenant_id, on top of RLS.
export async function OnboardingChecklist({ tenantId, bookings }: { tenantId: string; bookings: boolean }) {
  const steps = await loadSetupSteps(await createClient(), tenantId, bookings);
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card className="gap-4 px-[22px] py-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Get set up</h2>
          <p className="text-[13px] text-muted-foreground">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-track" aria-hidden>
          <div
            className="h-full rounded-full bg-linear-to-r from-[#6d67f5] to-[#4338ca] transition-[width] duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link
              href={s.href}
              className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:bg-hover"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                  s.done ? "bg-tone-ok text-tone-ok-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {s.done ? <CheckIcon className="size-3.5" strokeWidth={3} aria-label="Done" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                <span className="block text-[13px] text-muted-foreground">{s.text}</span>
              </span>
              <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
