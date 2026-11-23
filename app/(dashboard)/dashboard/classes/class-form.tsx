"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveClassAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export type ClassFormValues = {
  title: string;
  description: string;
  staff_id: string;
  weekdays: number[];
  start_time: string;
  duration_minutes: number;
  capacity: string;
  price: string;
  location: string;
  starts_on: string;
  ends_on: string;
  active: boolean;
};

// Monday first, as a week reads; values are 0 = Sunday ... 6 = Saturday.
const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

export function ClassForm({
  classId,
  initial,
  staff,
  canTakePayments,
}: {
  classId: string | null;
  initial: ClassFormValues;
  staff: { id: string; name: string }[];
  canTakePayments: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [price, setPrice] = useState(initial.price);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setMessage(null);
          const r = await saveClassAction(classId, fd);
          if (r.error) setMessage({ ok: false, text: r.error });
          if (!classId && r.id) return router.push(`/dashboard/classes/${r.id}?created=1`);
          if (!r.error) {
            setMessage({ ok: true, text: "Saved. Upcoming sessions are updated." });
            router.refresh();
          }
        })
      }
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Class name</Label>
        <Input id="title" name="title" required maxLength={120} defaultValue={initial.title} placeholder="Beginners Yoga" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} maxLength={5000} defaultValue={initial.description} placeholder="What it is, who it's for, what to bring." />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="staff_id">Instructor</Label>
        <select id="staff_id" name="staff_id" defaultValue={initial.staff_id} className="h-9 rounded-md border bg-transparent px-3 text-sm">
          <option value="">No instructor shown</option>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {staff.length === 0 && <p className="text-xs text-muted-foreground">Add your instructors under Staff to show their name and photo.</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background">
              <input type="checkbox" name="weekdays" value={value} defaultChecked={initial.weekdays.includes(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="start_time">Starts</Label>
          <Input id="start_time" name="start_time" type="time" required defaultValue={initial.start_time} />
        </div>
        <div className="flex w-36 flex-col gap-2">
          <Label htmlFor="duration_minutes">Length (min)</Label>
          <Input id="duration_minutes" name="duration_minutes" type="number" min={5} max={600} required defaultValue={initial.duration_minutes} />
        </div>
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="capacity">Spots</Label>
          <Input id="capacity" name="capacity" inputMode="numeric" defaultValue={initial.capacity} placeholder="No limit" />
        </div>
        <div className="flex w-40 flex-col gap-2">
          <Label htmlFor="price">Drop-in price (R)</Label>
          <Input id="price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Free" />
        </div>
      </div>
      {price.trim() !== "" && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {canTakePayments
            ? "People pay online into your PayFast account when they book; their spot is held until they pay."
            : "Payments aren't set up, so people book now and pay at the class. Connect PayFast in Settings → Payments to take payment online."}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Where</Label>
        <Input id="location" name="location" maxLength={300} defaultValue={initial.location} placeholder="Studio 2" />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor="starts_on">From</Label>
          <Input id="starts_on" name="starts_on" type="date" required defaultValue={initial.starts_on} />
        </div>
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor="ends_on">Until (optional)</Label>
          <Input id="ends_on" name="ends_on" type="date" defaultValue={initial.ends_on} />
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch name="active" defaultChecked={initial.active} />
        On the timetable (switch off to stop the class; booked sessions stay)
      </label>

      {message && <p className={`text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{message.text}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : classId ? "Save class" : "Create class"}
        </Button>
      </div>
    </form>
  );
}
