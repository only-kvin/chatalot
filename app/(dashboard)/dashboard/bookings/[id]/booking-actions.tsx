"use client";

import { useState, useTransition } from "react";
import {
  cancelBookingAction,
  getRescheduleSlotsAction,
  rescheduleBookingAction,
  setBookingOutcomeAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "idle" | "reschedule" | "cancel";

export function BookingActions({
  bookingId,
  status,
  started,
  canMessageOnWhatsApp,
  defaultDate,
}: {
  bookingId: string;
  status: string;
  started: boolean;
  canMessageOnWhatsApp: boolean;
  defaultDate: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notify, setNotify] = useState(canMessageOnWhatsApp);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);

  if (status === "cancelled") return null;

  function run(action: () => Promise<{ error: string | null; notice?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(result.notice ?? null);
      setMode("idle");
      setTime(null);
      setSlots(null);
    });
  }

  function loadSlots(forDate: string) {
    setDate(forDate);
    setTime(null);
    setSlots(null);
    setError(null);
    if (!forDate) return;
    startTransition(async () => {
      const result = await getRescheduleSlotsAction(bookingId, forDate);
      if (result.error) setError(result.error);
      else setSlots(result.slots);
    });
  }

  const notifyToggle = (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
      {canMessageOnWhatsApp
        ? "Tell the customer on WhatsApp (if they messaged in the last 24 hours)"
        : "Remind me to tell the customer"}
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice && <p className="feedback-enter rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>}
        {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}

        {status === "confirmed" && !started && mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMode("reschedule");
                loadSlots(date);
              }}
            >
              Reschedule
            </Button>
            <Button variant="destructive" onClick={() => setMode("cancel")}>
              Cancel booking
            </Button>
          </div>
        )}

        {mode === "reschedule" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-date">New date</Label>
              <Input id="new-date" type="date" value={date} onChange={(e) => loadSlots(e.target.value)} className="w-48" />
            </div>
            {slots && slots.length === 0 && <p className="text-sm text-zinc-500">No open times that day.</p>}
            {slots && slots.length > 0 && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Available times">
                {slots.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={time === s}
                    variant={time === s ? "default" : "outline"}
                    onClick={() => setTime(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
            {notifyToggle}
            <div className="flex gap-2">
              <Button
                disabled={pending || !time}
                onClick={() =>
                  time &&
                  run(() => rescheduleBookingAction({ bookingId, date, time, notifyCustomer: notify }))
                }
              >
                {pending ? "Saving…" : time ? `Move to ${time}` : "Pick a time"}
              </Button>
              <Button variant="outline" onClick={() => setMode("idle")} disabled={pending}>
                Back
              </Button>
            </div>
          </div>
        )}

        {mode === "cancel" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancel-reason">Reason (optional, included in the message to the customer)</Label>
              <Input
                id="cancel-reason"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. The stylist is ill"
              />
            </div>
            {notifyToggle}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => cancelBookingAction({ bookingId, reason, notifyCustomer: notify }))}
              >
                {pending ? "Cancelling…" : "Cancel booking"}
              </Button>
              <Button variant="outline" onClick={() => setMode("idle")} disabled={pending}>
                Back
              </Button>
            </div>
          </div>
        )}

        {started && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">Did the customer come in?</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={status === "completed" ? "default" : "outline"}
                disabled={pending || status === "completed"}
                onClick={() => run(() => setBookingOutcomeAction(bookingId, "completed"))}
              >
                Attended
              </Button>
              <Button
                variant={status === "no_show" ? "destructive" : "outline"}
                disabled={pending || status === "no_show"}
                onClick={() => run(() => setBookingOutcomeAction(bookingId, "no_show"))}
              >
                No-show
              </Button>
              {status !== "confirmed" && (
                <Button variant="ghost" disabled={pending} onClick={() => run(() => setBookingOutcomeAction(bookingId, "confirmed"))}>
                  Undo
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
