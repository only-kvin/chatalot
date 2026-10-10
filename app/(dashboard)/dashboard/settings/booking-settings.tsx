"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { XIcon } from "lucide-react";
import { updateBookingSettingsAction } from "./booking-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export type BookingSettings = {
  business_address: string;
  service_areas: string[];
  travel_buffer_minutes: number;
  cancellation_policy: string;
  callouts_confirm_instantly: boolean;
  emergency_callouts: boolean;
  emergency_note: string;
  owner_alert_phone: string;
};

// Suburbs and towns as chips: type and press Enter (or a comma) to add.
function AreasInput({ initial }: { initial: string[] }) {
  const [areas, setAreas] = useState(initial);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw.split(",").map((a) => a.trim()).filter(Boolean);
    if (!parts.length) return;
    setAreas((now) => [...now, ...parts.filter((p) => !now.some((a) => a.toLowerCase() === p.toLowerCase()))]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && areas.length) {
      setAreas((now) => now.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="service_areas" value={[...areas, draft.trim()].filter(Boolean).join("\n")} />
      {areas.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Areas you cover">
          {areas.map((a) => (
            <li key={a} className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pr-1 pl-3 text-sm">
              {a}
              <button
                type="button"
                onClick={() => setAreas((now) => now.filter((x) => x !== a))}
                className="rounded-full p-1 hover:bg-muted"
                aria-label={`Remove ${a}`}
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id="service_areas_input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder="Type a suburb or town and press Enter"
      />
    </div>
  );
}

export function BookingSettingsCard({ initial }: { initial: BookingSettings }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emergency, setEmergency] = useState(initial.emergency_callouts);

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBookingSettingsAction(formData);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <form action={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <CardDescription>
            Where you work, call-outs to customers&apos; addresses, your cancellation policy and emergencies.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="business_address">Your address</Label>
            <Input
              id="business_address"
              name="business_address"
              defaultValue={initial.business_address}
              placeholder="Shop 4, 12 Main Road, Rosebank"
            />
            <p className="text-xs text-muted-foreground">Shown to customers on bookings at your place.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="service_areas_input">Areas you cover for call-outs</Label>
            <AreasInput initial={initial.service_areas} />
            <p className="text-xs text-muted-foreground">
              Customers outside these areas can still send a request; it waits for you to confirm. Leave empty to take
              any address.
            </p>
          </div>

          <div className="flex w-56 flex-col gap-2">
            <Label htmlFor="travel_buffer_minutes">Travel time (min)</Label>
            <Input
              id="travel_buffer_minutes"
              name="travel_buffer_minutes"
              type="number"
              min={0}
              max={240}
              defaultValue={initial.travel_buffer_minutes}
            />
            <p className="text-xs text-muted-foreground">Kept free before and after every call-out.</p>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <Switch name="callouts_confirm_instantly" defaultChecked={initial.callouts_confirm_instantly} />
            <span>
              Confirm call-outs instantly
              <span className="block text-xs text-muted-foreground">
                Off: call-outs come to you as requests to approve. Ones outside your areas always do.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cancellation_policy">Cancellation policy</Label>
            <Textarea
              id="cancellation_policy"
              name="cancellation_policy"
              rows={2}
              defaultValue={initial.cancellation_policy}
              placeholder="Please give 24 hours' notice. Late cancellations pay the call-out fee."
            />
            <p className="text-xs text-muted-foreground">Shown in confirmations, reminders and the AI&apos;s answers.</p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <label className="flex items-start gap-3 text-sm">
              <Switch name="emergency_callouts" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
              <span>
                Emergency call-outs
                <span className="block text-xs text-muted-foreground">
                  When a customer describes something urgent, the AI doesn&apos;t offer booking times: it alerts you
                  straight away and hands the chat to you.
                </span>
              </span>
            </label>
            {emergency && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="emergency_note">What the AI tells them</Label>
                  <Input
                    id="emergency_note"
                    name="emergency_note"
                    defaultValue={initial.emergency_note}
                    placeholder="24/7 emergency call-outs, R950 after hours. We'll call you back within 30 minutes."
                  />
                  <p className="text-xs text-muted-foreground">
                    The AI only promises what you write here, e.g. a call-back time.
                  </p>
                </div>
                <div className="flex w-64 flex-col gap-2">
                  <Label htmlFor="owner_alert_phone">Your mobile for WhatsApp alerts</Label>
                  <Input
                    id="owner_alert_phone"
                    name="owner_alert_phone"
                    type="tel"
                    defaultValue={initial.owner_alert_phone}
                    placeholder="082 123 4567"
                  />
                  <p className="text-xs text-muted-foreground">Needs your business WhatsApp number connected.</p>
                </div>
              </>
            )}
            {!emergency && (
              <>
                <input type="hidden" name="emergency_note" value={initial.emergency_note} />
                <input type="hidden" name="owner_alert_phone" value={initial.owner_alert_phone} />
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Whatever you choose, for gas smells, sparking, flooding near electrics or anyone hurt, the AI first tells
              the customer to get to safety and call emergency services.
            </p>
          </div>

          {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
          {saved && <p className="feedback-enter text-sm text-green-700">Saved.</p>}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save booking settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
