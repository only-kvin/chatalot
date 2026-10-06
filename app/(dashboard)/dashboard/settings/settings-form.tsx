"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Settings = {
  business_name: string;
  tone: string;
  greeting: string;
  system_prompt_extra: string;
  handoff_contact: string;
  booking_change_cutoff_minutes: number;
  google_review_url: string;
  daily_summary_enabled: boolean;
  allowed_domains: string[];
};

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

export function SettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettingsAction(formData);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Business info</CardTitle>
          <CardDescription>
            How your AI receptionist introduces itself and talks to visitors.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="business_name">Business name</Label>
            <Input
              id="business_name"
              name="business_name"
              required
              defaultValue={initialSettings.business_name}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tone">Tone</Label>
            <Input
              id="tone"
              name="tone"
              required
              defaultValue={initialSettings.tone}
              placeholder="friendly and professional"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="greeting">Greeting</Label>
            <Input
              id="greeting"
              name="greeting"
              required
              defaultValue={initialSettings.greeting}
              placeholder="Hi! How can I help you today?"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="system_prompt_extra">Extra instructions (optional)</Label>
            <Textarea
              id="system_prompt_extra"
              name="system_prompt_extra"
              rows={3}
              defaultValue={initialSettings.system_prompt_extra}
              placeholder="Anything else the AI should know or do, e.g. mention a current promotion."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="handoff_contact">Handoff contact (optional)</Label>
            <Input
              id="handoff_contact"
              name="handoff_contact"
              defaultValue={initialSettings.handoff_contact}
              placeholder="021 555 0134"
            />
            <p className="text-xs text-zinc-500">
              Given to visitors, and used in the fallback reply, when a human needs to step in.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <CardDescription>
            How close to an appointment customers can still cancel or reschedule it themselves in chat.
            After that, the AI hands them over to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="booking_change_cutoff_minutes">Customers can change bookings up to</Label>
          <select
            id="booking_change_cutoff_minutes"
            name="booking_change_cutoff_minutes"
            defaultValue={String(initialSettings.booking_change_cutoff_minutes)}
            className="h-9 w-full max-w-xs rounded-lg border bg-transparent px-3 text-sm"
          >
            {CUTOFF_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {!CUTOFF_OPTIONS.some((o) => o.value === initialSettings.booking_change_cutoff_minutes) && (
              <option value={initialSettings.booking_change_cutoff_minutes}>
                {initialSettings.booking_change_cutoff_minutes} minutes before
              </option>
            )}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <CardDescription>
            The morning after you mark a booking Attended, we ask the customer on WhatsApp to rate their visit
            from 1 to 5 and share your Google review link. Low scores (3 or below) alert you so you can follow up.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="google_review_url">Google review link</Label>
          <Input
            id="google_review_url"
            name="google_review_url"
            type="url"
            defaultValue={initialSettings.google_review_url}
            placeholder="https://g.page/r/…/review"
          />
          <p className="text-xs text-zinc-500">
            Find it in your Google Business Profile under &ldquo;Ask for reviews&rdquo;. Leave empty to turn review
            requests off. Every customer gets the link, whatever their score, as Google requires.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily summary</CardTitle>
          <CardDescription>
            An email at 08:00 with today&rsquo;s bookings, anything waiting for you, and how yesterday went. Mornings
            with nothing to report are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="daily_summary_enabled"
              defaultChecked={initialSettings.daily_summary_enabled}
              className="size-4"
            />
            Email me a daily summary
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed domains</CardTitle>
          <CardDescription>
            Websites allowed to load your chat widget — one per line. The widget refuses to
            load anywhere else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="allowed_domains"
            name="allowed_domains"
            rows={4}
            defaultValue={initialSettings.allowed_domains.join("\n")}
            placeholder="yourbusiness.co.za"
          />
        </CardContent>
      </Card>

      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="feedback-enter text-sm text-green-600">Saved.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
