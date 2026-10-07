"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBookingWidgetAction, updateWidgetThemeAction } from "./actions";
import { CopySnippetButton } from "./widget-editor";
import { FORM_KIND, type WidgetTheme, type WidgetType } from "@/lib/widgets/config";
import type { Field } from "@/lib/widgets/fields";
import { FormFieldsEditor } from "@/components/dashboard/form-fields-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const selectClass = "h-9 rounded-lg border bg-transparent px-3 text-sm";

function Feedback({ error, saved }: { error: string | null; saved: boolean }) {
  if (error) return <p className="feedback-enter text-sm text-red-600">{error}</p>;
  if (saved) return <p className="feedback-enter text-sm text-green-600">Saved.</p>;
  return null;
}

function useSave() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  function save(action: () => Promise<{ error: string | null }>, onSaved?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        onSaved?.();
        router.refresh();
      }
    });
  }
  return { pending, error, saved, save };
}

export function ThemeForm({ theme, onSaved }: { theme: WidgetTheme; onSaved?: () => void }) {
  const { pending, error, saved, save } = useSave();
  return (
    <form action={(fd) => save(() => updateWidgetThemeAction(fd), onSaved)} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {(
          [
            ["primary_color", "Main colour (also the chat's)", theme.primary],
            ["surface_color", "Background", theme.surface],
            ["text_color", "Text", theme.text],
          ] as const
        ).map(([name, label, value]) => (
          <div key={name} className="flex flex-col gap-2">
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} name={name} type="color" defaultValue={value} className="h-9 w-24 p-1" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="corner_radius">Corner roundness (px)</Label>
          <Input id="corner_radius" name="corner_radius" type="number" min={0} max={32} defaultValue={theme.radius} className="w-28" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="font">Font</Label>
          <select id="font" name="font" defaultValue={theme.font} className={selectClass}>
            <option value="system">Same as your website</option>
            <option value="inter">Inter</option>
            <option value="poppins">Poppins</option>
            <option value="nunito">Nunito</option>
            <option value="lora">Lora (serif)</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="color_mode">Light or dark</Label>
          <select id="color_mode" name="color_mode" defaultValue={theme.mode} className={selectClass}>
            <option value="light">Always your colours</option>
            <option value="dark">Dark</option>
            <option value="auto">Follow the visitor&apos;s device</option>
          </select>
        </div>
      </div>
      <Feedback error={error} saved={saved} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save look"}
        </Button>
      </div>
    </form>
  );
}

// What each widget type lets owners word and switch, for the shared form.
const WIDGET_UI: Record<
  WidgetType,
  {
    name: string;
    description: string;
    copy: [string, string][];
    toggles: [string, string][];
    place: string;
  }
> = {
  schedule: {
    name: "Schedule widget",
    description: "Customers pick a day and time first, then fill in this form. Times come from your services, staff and availability.",
    copy: [
      ["title", "Title"],
      ["confirmButton", "Confirm button"],
      ["successTitle", "Booked: heading"],
      ["successMessage", "Booked: message"],
      ["requestedTitle", "Awaiting approval: heading"],
      ["requestedMessage", "Awaiting approval: message"],
    ],
    toggles: [["allowStaffChoice", "Let customers choose who they book with (once you have staff)"]],
    place: "the calendar",
  },
  appointment: {
    name: "Appointment widget",
    description: "Customers browse your services first, then choose who, then when, then fill in this form.",
    copy: [
      ["title", "Title"],
      ["confirmButton", "Confirm button"],
      ["successTitle", "Booked: heading"],
      ["successMessage", "Booked: message"],
      ["nextSteps", "What happens next (e.g. \"Please arrive 5 minutes early\")"],
      ["requestedTitle", "Awaiting approval: heading"],
      ["requestedMessage", "Awaiting approval: message"],
    ],
    toggles: [
      ["allowAnyStaff", "Offer \"Any available\" above your staff"],
      ["groupByCategory", "Show services under their categories"],
    ],
    place: "the service list",
  },
  contact: {
    name: "Contact widget",
    description: "A message form. Each message lands in Messages and Leads, and you get an alert.",
    copy: [
      ["title", "Title"],
      ["submitButton", "Send button"],
      ["successTitle", "Sent: heading"],
      ["successMessage", "Sent: message"],
      ["responseTime", "Expected response time (e.g. \"We usually reply within one working day.\")"],
    ],
    toggles: [
      ["offerNewsletter", "Offer a newsletter sign-up box (unticked)"],
      ["offerPromotions", "Offer an events and promotions box (unticked)"],
    ],
    place: "the form",
  },
};

type WidgetValues = {
  active: boolean;
  copy: Record<string, string>;
  settings: Record<string, boolean>;
  fields: Field[];
};

export function BookingWidgetForm({
  type,
  initial,
  onSaved,
}: {
  type: WidgetType;
  initial: WidgetValues;
  onSaved?: () => void;
}) {
  const ui = WIDGET_UI[type];
  const { pending, error, saved, save } = useSave();
  const [active, setActive] = useState(initial.active);
  const [copy, setCopy] = useState(initial.copy);
  const [settings, setSettings] = useState(initial.settings);
  const [fields, setFields] = useState(initial.fields);

  return (
    <form action={() => save(() => saveBookingWidgetAction(type, { active, copy, settings, fields }), onSaved)} className="flex flex-col gap-6">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {ui.name} is on
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Wording</legend>
        {ui.copy.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <Label htmlFor={`${type}-copy-${key}`}>{label}</Label>
            <Input id={`${type}-copy-${key}`} value={copy[key] ?? ""} onChange={(e) => setCopy({ ...copy, [key]: e.target.value })} />
          </div>
        ))}
      </fieldset>

      {ui.toggles.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={settings[key] ?? false}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}

      <FormFieldsEditor kind={FORM_KIND[type]} fields={fields} onChange={setFields} consentNote={FORM_KIND[type] === "booking"} />

      <Feedback error={error} saved={saved} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Save ${ui.name.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}

export function WidgetSnippet({ type, snippet }: { type: WidgetType; snippet: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add it to your website</CardTitle>
        <CardDescription>
          Put the box where {WIDGET_UI[type].place} should appear. The script line is the same one the chat uses:
          include it once per page. Add <code>data-mode=&quot;float&quot;</code> to the box for a floating button instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{snippet}</pre>
        <div>
          <CopySnippetButton snippet={snippet} />
        </div>
      </CardContent>
    </Card>
  );
}

// Look, the widget's settings and a live preview (the real bundle against
// the saved settings), reloaded after each save.
export function BookingWidgetTab({
  type,
  theme,
  initial,
}: {
  type: WidgetType;
  theme: WidgetTheme;
  initial: WidgetValues;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const ui = WIDGET_UI[type];
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_440px]">
      <div className="flex flex-col gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Look</CardTitle>
            <CardDescription>Shared by all your booking widgets, so they match your website.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeForm theme={theme} onSaved={reload} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{ui.name}</CardTitle>
            <CardDescription>{ui.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <BookingWidgetForm type={type} initial={initial} onSaved={reload} />
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-2 xl:sticky xl:top-8 xl:self-start">
        <Label>Live preview</Label>
        <iframe
          key={reloadKey}
          src={`/dashboard/widget/preview?widget=${type}`}
          title={`${ui.name} preview`}
          className="h-[720px] w-full rounded-lg border bg-white"
        />
        <p className="text-xs text-zinc-500">Real bookings made here are real: cancel them from Bookings.</p>
      </div>
    </div>
  );
}
