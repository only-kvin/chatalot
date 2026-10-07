"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Settings = {
  business_name: string;
  tone: string;
  greeting: string;
  system_prompt_extra: string;
  handoff_contact: string;
  google_review_url: string;
  booking_page_url: string;
  daily_summary_enabled: boolean;
  allowed_domains: string[];
};

// Sections for features not on their plan are left out; the menu's lock
// is where those get offered, so Settings stays uncluttered.
export function SettingsForm({
  initialSettings,
  hostedBookingUrl,
  showBookingPage,
  showReviews,
}: {
  initialSettings: Settings;
  hostedBookingUrl: string;
  showBookingPage: boolean;
  showReviews: boolean;
}) {
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
            <p className="text-xs text-muted-foreground">
              Given to visitors, and used in the fallback reply, when a human needs to step in.
            </p>
          </div>
        </CardContent>
      </Card>

      {showBookingPage && (
        <Card>
          <CardHeader>
            <CardTitle>Online booking page</CardTitle>
            <CardDescription>
              Where the AI sends customers who&apos;d rather book by clicking. By default it&apos;s your page on
              ChatAlot, with your appointment widget: {" "}
              <a href={hostedBookingUrl} target="_blank" rel="noreferrer" className="underline">
                {hostedBookingUrl}
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="booking_page_url">Use my own page instead (optional)</Label>
            <Input
              id="booking_page_url"
              name="booking_page_url"
              type="url"
              defaultValue={initialSettings.booking_page_url}
              placeholder="https://yourbusiness.co.za/book"
            />
            <p className="text-xs text-muted-foreground">
              Only if that page has your appointment widget on it (Widgets → Appointment). Leave empty to use the page above.
            </p>
          </CardContent>
        </Card>
      )}

      {showReviews && (
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
            <p className="text-xs text-muted-foreground">
              Find it in your Google Business Profile under &ldquo;Ask for reviews&rdquo;. Leave empty to turn review
              requests off. Every customer gets the link, whatever their score, as Google requires.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daily summary</CardTitle>
          <CardDescription>
            An email at 08:00 with today&rsquo;s bookings, anything waiting for you, and how yesterday went. Mornings
            with nothing to report are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              name="daily_summary_enabled"
              defaultChecked={initialSettings.daily_summary_enabled}
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
