"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStudioWidgetAction, setStudioWidgetStatusAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPES = [
  { value: "appointment", label: "Appointment (service first)" },
  { value: "schedule", label: "Schedule (date first)" },
  { value: "contact", label: "Contact form" },
  { value: "registration", label: "Registration" },
  { value: "events", label: "Events" },
  { value: "classes", label: "Find a Class" },
];

export function NewWidgetForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      ref={form}
      action={(fd) =>
        startTransition(async () => {
          const r = await createStudioWidgetAction(tenantId, fd);
          setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: "Widget created. Its embed code is below." });
          if (!r.error) {
            form.current?.reset();
            router.refresh();
          }
        })
      }
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Type</Label>
        <select id="type" name="type" className="h-9 rounded-md border bg-transparent px-3 text-sm" required>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" maxLength={60} placeholder="e.g. Home page booking, Nail bar only" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <select id="status" name="status" defaultValue="live" className="h-9 rounded-md border bg-transparent px-3 text-sm">
          <option value="live">Live: works on the website</option>
          <option value="draft">Draft: preview only</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create widget"}
      </Button>
      {message && <p className={`w-full text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{message.text}</p>}
    </form>
  );
}

export function StatusSwitch({ tenantId, widgetId, status }: { tenantId: string; widgetId: string; status: "draft" | "live" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = status === "live" ? "draft" : "live";
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setStudioWidgetStatusAction(tenantId, widgetId, next);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {next === "live" ? "Make live" : "Back to draft"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
