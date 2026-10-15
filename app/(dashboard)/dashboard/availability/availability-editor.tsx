"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAvailabilityExceptionAction,
  deleteAvailabilityExceptionAction,
  updateBookingRulesAction,
} from "./actions";
import { formatLocalDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Exception = {
  id: string;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BookingRules = {
  booking_lead_time_minutes: number;
  booking_horizon_days: number;
  slot_minutes: number;
  booking_change_cutoff_minutes: number;
  bookings_need_approval: boolean;
};

const LEAD_OPTIONS = [
  { value: 0, label: "No minimum" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 1440, label: "24 hours" },
  { value: 2880, label: "48 hours" },
];
const HORIZON_OPTIONS = [7, 14, 30, 60, 90, 180];
const SLOT_OPTIONS = [15, 30, 60];
// Minimum notice for customers to cancel or move a booking themselves in chat.
const CUTOFF_OPTIONS = [
  { value: 0, label: "Any time before the appointment" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 240, label: "4 hours before" },
  { value: 720, label: "12 hours before" },
  { value: 1440, label: "24 hours before" },
  { value: 2880, label: "48 hours before" },
];

const selectClass = "h-9 w-full max-w-xs rounded-lg border bg-transparent px-3 text-sm";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }
  return { pending, error, saved, run };
}

// Keeps a value that isn't one of the presets (e.g. set in the database)
// selectable instead of silently replacing it.
function withCurrent<T extends { value: number }>(options: T[], current: number, label: (v: number) => string) {
  return options.some((o) => o.value === current) ? options : [...options, { value: current, label: label(current) }];
}

export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const { pending, error, saved, run } = useAction();
  return (
    <form action={(formData) => run(() => updateBookingRulesAction(formData))} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking_lead_time_minutes">Minimum notice for new bookings</Label>
        <select
          id="booking_lead_time_minutes"
          name="booking_lead_time_minutes"
          defaultValue={rules.booking_lead_time_minutes}
          className={selectClass}
        >
          {withCurrent(LEAD_OPTIONS, rules.booking_lead_time_minutes, (v) => `${v} minutes`).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking_horizon_days">Customers can book up to</Label>
        <select id="booking_horizon_days" name="booking_horizon_days" defaultValue={rules.booking_horizon_days} className={selectClass}>
          {withCurrent(
            HORIZON_OPTIONS.map((d) => ({ value: d, label: `${d} days ahead` })),
            rules.booking_horizon_days,
            (v) => `${v} days ahead`,
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slot_minutes">Offer start times every</Label>
        <select id="slot_minutes" name="slot_minutes" defaultValue={rules.slot_minutes} className={selectClass}>
          {SLOT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Counted from opening time, e.g. 09:00, 09:30, 10:00 for every 30 minutes.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking_change_cutoff_minutes">Customers can change or cancel bookings in chat up to</Label>
        <select
          id="booking_change_cutoff_minutes"
          name="booking_change_cutoff_minutes"
          defaultValue={rules.booking_change_cutoff_minutes}
          className={selectClass}
        >
          {withCurrent(CUTOFF_OPTIONS, rules.booking_change_cutoff_minutes, (v) => `${v} minutes before`).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">After that, the AI hands them over to you.</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-3 text-sm">
          <Switch
            name="bookings_need_approval"
            defaultChecked={rules.bookings_need_approval}
          />
          I approve bookings before they&apos;re confirmed
        </label>
        <p className="text-xs text-muted-foreground">
          Bookings from your website and the AI then wait under Bookings → To approve, holding their time, until you
          approve or decline them. Customers are told it&apos;s a request.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        These apply to customers. You can still book and move bookings at short notice from the dashboard.
      </p>
      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="feedback-enter text-sm text-green-600">Saved.</p>}
      <div>
        <Button type="submit" disabled={pending} data-echo="rules.save">
          {pending ? "Saving…" : "Save booking rules"}
        </Button>
      </div>
    </form>
  );
}

const hhmm = (t: string) => t.slice(0, 5);

export function ExceptionsEditor({ exceptions }: { exceptions: Exception[] }) {
  const { pending, error, run } = useAction();
  const sorted = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col gap-4">
      <form action={(formData) => run(() => createAvailabilityExceptionAction(formData))} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="exc_start_time">Special hours from</Label>
          <Input id="exc_start_time" name="start_time" type="time" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="exc_end_time">To</Label>
          <Input id="exc_end_time" name="end_time" type="time" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input name="is_closed" type="checkbox" defaultChecked className="size-4" />
          Closed all day
        </label>
        <Button type="submit" disabled={pending} data-echo="closure.add">
          Add
        </Button>
      </form>
      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No closures or special hours.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {sorted.map((exc) => (
            <li key={exc.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{formatLocalDate(exc.date)}</span>
                <span className="ml-2 text-muted-foreground">
                  {exc.is_closed ? "Closed" : `${hhmm(exc.start_time!)}–${hhmm(exc.end_time!)}`}
                </span>
              </span>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => deleteAvailabilityExceptionAction(exc.id))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
