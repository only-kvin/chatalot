"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAvailabilityRuleAction,
  deleteAvailabilityRuleAction,
} from "@/app/(dashboard)/dashboard/availability/actions";
import { WEEKDAY_NAMES } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WeeklyRule = { id: string; weekday: number; start_time: string; end_time: string };

// Monday first, the way owners think about their week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const hhmm = (t: string) => t.slice(0, 5);

// Weekly hours for the business (staffId null) or one staff member. Several
// windows on a day make a break: 09:00–13:00 and 14:00–18:00.
export function WeeklyHours({
  rules,
  staffId,
  emptyText,
}: {
  rules: WeeklyRule[];
  staffId: string | null;
  emptyText: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const byDay = WEEK_ORDER.map((weekday) => ({
    weekday,
    windows: rules.filter((r) => r.weekday === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));
  const idPrefix = staffId ? `hours-${staffId}` : "hours";

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(formData) => {
          if (staffId) formData.set("staff_id", staffId);
          run(() => createAvailabilityRuleAction(formData));
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-weekday`}>Day</Label>
          <select
            id={`${idPrefix}-weekday`}
            name="weekday"
            defaultValue="1"
            className="h-9 w-36 rounded-lg border bg-transparent px-3 text-sm"
          >
            {WEEK_ORDER.map((i) => (
              <option key={i} value={i}>
                {WEEKDAY_NAMES[i]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-from`}>From</Label>
          <Input id={`${idPrefix}-from`} name="start_time" type="time" required defaultValue="09:00" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-to`}>To</Label>
          <Input id={`${idPrefix}-to`} name="end_time" type="time" required defaultValue="17:00" />
        </div>
        <Button type="submit" disabled={pending}>
          Add hours
        </Button>
      </form>
      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}

      {rules.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {byDay.map(({ weekday, windows }) => (
            <li key={weekday} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-24 font-medium">{WEEKDAY_NAMES[weekday]}</span>
              {windows.length === 0 && <span className="text-zinc-400">Closed</span>}
              {windows.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5">
                  {hhmm(w.start_time)}–{hhmm(w.end_time)}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteAvailabilityRuleAction(w.id))}
                    className="ml-1 text-zinc-400 hover:text-red-600"
                    aria-label={`Remove ${WEEKDAY_NAMES[weekday]} ${hhmm(w.start_time)}–${hhmm(w.end_time)}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
