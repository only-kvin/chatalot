"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { saveScheduleWidgetAction, updateWidgetThemeAction } from "./actions";
import { CopySnippetButton } from "./widget-editor";
import type { ScheduleCopy, ScheduleSettings, WidgetTheme } from "@/lib/widgets/config";
import { customKey, DEFAULT_FIELDS, FIELD_TYPES, type Field, type FieldType } from "@/lib/widgets/fields";
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

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text",
  email: "Email",
  tel: "Phone",
  textarea: "Long text",
  select: "Choice list",
  checkbox: "Tick box",
  date: "Date",
};
// Custom fields can't be email or phone: those are the built-ins.
const CUSTOM_TYPES = FIELD_TYPES.filter((t) => t !== "email" && t !== "tel");
const LOCKED = ["full_name", "phone"];

function FieldRow({
  field,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  field: Field;
  first: boolean;
  last: boolean;
  onChange: (f: Field) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const custom = field.key.startsWith("custom_");
  const locked = LOCKED.includes(field.key);
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Question"
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          className="min-w-48 flex-1"
        />
        {custom ? (
          <select
            aria-label="Answer type"
            value={field.type}
            onChange={(e) => onChange({ ...field, type: e.target.value as FieldType, options: e.target.value === "select" ? (field.options ?? []) : undefined })}
            className={selectClass}
          >
            {CUSTOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-zinc-500">{TYPE_LABEL[field.type]}</span>
        )}
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={field.required}
            disabled={locked}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
          />
          Required
        </label>
        <div className="ml-auto flex items-center">
          <Button type="button" variant="ghost" size="icon-sm" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${field.label} up`}>
            <ArrowUpIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${field.label} down`}>
            <ArrowDownIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={locked} onClick={onRemove} aria-label={`Remove ${field.label}`}>
            <XIcon />
          </Button>
        </div>
      </div>
      {field.type === "select" && (
        <Input
          aria-label="Choices, separated by commas"
          placeholder="Choices, separated by commas: Short hair, Long hair"
          value={(field.options ?? []).join(", ")}
          onChange={(e) =>
            onChange({ ...field, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
          }
        />
      )}
      {locked && <p className="text-xs text-zinc-500">Always asked: needed for the booking and reminders.</p>}
    </li>
  );
}

export function ScheduleForm({
  initial,
}: {
  initial: { active: boolean; copy: ScheduleCopy; settings: ScheduleSettings; fields: Field[] };
}) {
  const { pending, error, saved, save } = useSave();
  const [active, setActive] = useState(initial.active);
  const [copy, setCopy] = useState(initial.copy);
  const [settings, setSettings] = useState(initial.settings);
  const [fields, setFields] = useState(initial.fields);

  const missingBuiltins = DEFAULT_FIELDS.filter((d) => !fields.some((f) => f.key === d.key));
  const setField = (i: number, f: Field) => setFields(fields.map((x, j) => (j === i ? f : x)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setFields(next);
  };

  const COPY_LABELS: [keyof ScheduleCopy, string][] = [
    ["title", "Title"],
    ["confirmButton", "Confirm button"],
    ["successTitle", "Booked: heading"],
    ["successMessage", "Booked: message"],
    ["requestedTitle", "Awaiting approval: heading"],
    ["requestedMessage", "Awaiting approval: message"],
  ];

  return (
    <form
      action={() => save(() => saveScheduleWidgetAction({ active, copy, settings, fields }))}
      className="flex flex-col gap-6"
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Schedule widget is on (customers can book through it)
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Wording</legend>
        {COPY_LABELS.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <Label htmlFor={`copy-${key}`}>{label}</Label>
            <Input id={`copy-${key}`} value={copy[key]} onChange={(e) => setCopy({ ...copy, [key]: e.target.value })} />
          </div>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={settings.allowStaffChoice}
          onChange={(e) => setSettings({ ...settings, allowStaffChoice: e.target.checked })}
        />
        Let customers choose who they book with (once you have staff)
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Booking form</legend>
        <ul className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <FieldRow
              key={f.key}
              field={f}
              first={i === 0}
              last={i === fields.length - 1}
              onChange={(next) => setField(i, next)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => setFields(fields.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fields.length >= 20}
            onClick={() =>
              setFields([
                ...fields,
                { key: customKey("question", fields.map((f) => f.key)), label: "New question", type: "text", required: false },
              ])
            }
          >
            Add a question
          </Button>
          {missingBuiltins.map((d) => (
            <Button key={d.key} type="button" variant="outline" size="sm" onClick={() => setFields([...fields, d])}>
              Add {d.label.toLowerCase()}
            </Button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Customers also tick a box agreeing to you saving their details for the booking (POPIA).
        </p>
      </fieldset>

      <Feedback error={error} saved={saved} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save schedule widget"}
        </Button>
      </div>
    </form>
  );
}

export function ScheduleSnippet({ snippet }: { snippet: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add it to your website</CardTitle>
        <CardDescription>
          Put the box where the calendar should appear. The script line is the same one the chat uses: include it
          once per page.
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
