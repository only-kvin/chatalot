"use client";

import { useState, useTransition } from "react";
import {
  cancelBookingAction,
  decideBookingAction,
  getRescheduleSlotsAction,
  rescheduleBookingAction,
  setBookingOutcomeAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "idle" | "reschedule" | "cancel" | "decline";

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

        {status === "pending" && mode === "idle" && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
            <p className="text-sm">This booking is waiting for your approval. The time is held until you decide.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending}
                onClick={() => run(() => decideBookingAction({ bookingId, approve: true, reason: "" }))}
              >
                {pending ? "Saving…" : "Approve"}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setMode("decline")}>
                Decline
              </Button>
            </div>
            <p className="text-xs text-zinc-500">The customer is emailed either way, if they gave an email address.</p>
          </div>
        )}

        {mode === "decline" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="decline-reason">Message to the customer (optional)</Label>
              <Input
                id="decline-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Sorry, we're fully booked that day. Could you try Friday?"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => decideBookingAction({ bookingId, approve: false, reason }))}
              >
                {pending ? "Declining…" : "Decline booking"}
              </Button>
              <Button variant="outline" onClick={() => setMode("idle")} disabled={pending}>
                Back
              </Button>
            </div>
          </div>
        )}

        {(status === "confirmed" || status === "pending") && !started && mode === "idle" && (
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

        {started && status !== "pending" && (
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
