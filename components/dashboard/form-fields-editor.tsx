"use client";

import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { addableBuiltins, alwaysRequired, customKey, FIELD_TYPES, type Field, type FieldType, type FormKind } from "@/lib/widgets/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The booking-form builder used by every booking widget's settings: the
// questions customers answer, in order, with required toggles. Name and
// mobile are always asked; the server re-checks all of it on save.

const selectClass = "h-9 rounded-lg border bg-transparent px-3 text-sm";

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

function FieldRow({
  field,
  locked,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  field: Field;
  locked: boolean;
  first: boolean;
  last: boolean;
  onChange: (f: Field) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const custom = field.key.startsWith("custom_");
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
      {locked && <p className="text-xs text-zinc-500">Always asked.</p>}
    </li>
  );
}

export function FormFieldsEditor({
  kind,
  fields,
  onChange,
  consentNote = true,
}: {
  kind: FormKind;
  fields: Field[];
  onChange: (fields: Field[]) => void;
  consentNote?: boolean;
}) {
  const locked = alwaysRequired(kind);
  const missingBuiltins = addableBuiltins(kind, fields);
  const move = (i: number, dir: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Booking form</legend>
      <ul className="flex flex-col gap-2">
        {fields.map((f, i) => (
          <FieldRow
            key={f.key}
            field={f}
            locked={locked.includes(f.key)}
            first={i === 0}
            last={i === fields.length - 1}
            onChange={(next) => onChange(fields.map((x, j) => (j === i ? next : x)))}
            onMove={(dir) => move(i, dir)}
            onRemove={() => onChange(fields.filter((_, j) => j !== i))}
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
            onChange([
              ...fields,
              { key: customKey("question", fields.map((f) => f.key)), label: "New question", type: "text", required: false },
            ])
          }
        >
          Add a question
        </Button>
        {missingBuiltins.map((d) => (
          <Button key={d.key} type="button" variant="outline" size="sm" onClick={() => onChange([...fields, d])}>
            Add {d.label.toLowerCase()}
          </Button>
        ))}
      </div>
      {consentNote && (
        <p className="text-xs text-zinc-500">
          Customers also tick a box agreeing to you saving their details for the booking (POPIA).
        </p>
      )}
    </fieldset>
  );
}
