"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEventAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

// Creating or editing an event. Dates and times are SA time.

export type EventFormValues = {
  title: string;
  summary: string;
  description: string;
  date: string;
  start: string;
  end: string;
  location: string;
  capacity: string;
  max_per_signup: number;
  price: string;
  signups_open: boolean;
  status: "draft" | "published" | "cancelled";
};

export const BLANK_EVENT: EventFormValues = {
  title: "",
  summary: "",
  description: "",
  date: "",
  start: "10:00",
  end: "",
  location: "",
  capacity: "",
  max_per_signup: 1,
  price: "",
  signups_open: true,
  status: "draft",
};

export function EventForm({
  eventId,
  initial,
  canTakePayments,
}: {
  eventId: string | null;
  initial: EventFormValues;
  // Payments in the plan and PayFast connected: tickets are paid online.
  canTakePayments: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [price, setPrice] = useState(initial.price);
  const cancelled = initial.status === "cancelled";

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const r = await saveEventAction(eventId, formData);
      if (r.error) return setMessage({ ok: false, text: r.error });
      if (!eventId && r.id) router.push(`/dashboard/events/${r.id}?created=1`);
      else {
        setMessage({ ok: true, text: "Saved." });
        router.refresh();
      }
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={120} defaultValue={initial.title} placeholder="Summer open day" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">Short summary (on the event card)</Label>
        <Input id="summary" name="summary" maxLength={300} defaultValue={initial.summary} placeholder="Free mini treatments, snacks and a lucky draw" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={6} maxLength={5000} defaultValue={initial.description} placeholder="Everything people should know. Leave a blank line between paragraphs." />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" required defaultValue={initial.date} />
        </div>
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="start">Starts</Label>
          <Input id="start" name="start" type="time" required defaultValue={initial.start} />
        </div>
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="end">Ends (optional)</Label>
          <Input id="end" name="end" type="time" defaultValue={initial.end} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Where</Label>
        <Input id="location" name="location" maxLength={300} defaultValue={initial.location} placeholder="Shop 4, 12 Main Road, Rosebank (or Online)" />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex w-40 flex-col gap-2">
          <Label htmlFor="price">Ticket price (R)</Label>
          <Input id="price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Free" />
        </div>
        <div className="flex w-40 flex-col gap-2">
          <Label htmlFor="capacity">Spots</Label>
          <Input id="capacity" name="capacity" inputMode="numeric" defaultValue={initial.capacity} placeholder="No limit" />
        </div>
        <div className="flex w-48 flex-col gap-2">
          <Label htmlFor="max_per_signup">Tickets per sign-up (max)</Label>
          <Input id="max_per_signup" name="max_per_signup" type="number" min={1} max={20} defaultValue={initial.max_per_signup} />
        </div>
      </div>
      {price.trim() !== "" && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {canTakePayments
            ? "Customers pay online into your PayFast account when they sign up; their tickets are held until they pay."
            : "Payments aren't set up, so customers sign up now and pay at the event. Connect PayFast in Settings → Payments to take payment online."}
        </p>
      )}

      <label className="flex items-center gap-3 text-sm">
        <Switch name="signups_open" defaultChecked={initial.signups_open} disabled={cancelled} />
        Sign-ups open
      </label>

      {cancelled ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">This event is cancelled. It shows as cancelled on your website.</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Show on your website</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="status" value="published" defaultChecked={initial.status === "published"} /> Published
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="status" value="draft" defaultChecked={initial.status === "draft"} /> Draft (only you can see it)
          </label>
        </fieldset>
      )}

      {message && <p className={`text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{message.text}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : eventId ? "Save event" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
