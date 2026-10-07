"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { createServiceAction, deleteServiceAction, moveServiceAction, updateServiceAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Service = {
  id: string;
  name: string;
  description: string;
  category: string;
  duration_minutes: number;
  buffer_before_min: number;
  buffer_after_min: number;
  price_cents: number | null;
  active: boolean;
  online_bookable: boolean;
  // Empty = anyone.
  staffIds: string[];
};
type Staff = { id: string; name: string; active: boolean };

const BLANK: Omit<Service, "id"> = {
  name: "",
  description: "",
  category: "",
  duration_minutes: 30,
  buffer_before_min: 0,
  buffer_after_min: 0,
  price_cents: null,
  active: true,
  online_bookable: true,
  staffIds: [],
};

function formatPrice(cents: number | null): string {
  return cents === null ? "Price not set" : `R${(cents / 100).toFixed(2)}`;
}

function ServiceForm({
  service,
  staff,
  onDone,
}: {
  service: Service | null;
  staff: Staff[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const values = service ?? BLANK;
  const [staffMode, setStaffMode] = useState<"anyone" | "chosen">(values.staffIds.length ? "chosen" : "anyone");

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = service ? await updateServiceAction(service.id, formData) : await createServiceAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-[2] flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={values.name} placeholder="Haircut" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="category">Category (optional)</Label>
          <Input id="category" name="category" defaultValue={values.category} placeholder="Hair" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={values.description}
          placeholder="Wash, cut and blow-dry"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex w-36 flex-col gap-2">
          <Label htmlFor="duration_minutes">Duration (min)</Label>
          <Input id="duration_minutes" name="duration_minutes" type="number" min={5} required defaultValue={values.duration_minutes} />
        </div>
        <div className="flex w-36 flex-col gap-2">
          <Label htmlFor="price_rand">Price (R, optional)</Label>
          <Input
            id="price_rand"
            name="price_rand"
            type="number"
            min={0}
            step="0.01"
            defaultValue={values.price_cents !== null ? (values.price_cents / 100).toFixed(2) : ""}
          />
        </div>
        <div className="flex w-36 flex-col gap-2">
          <Label htmlFor="buffer_before_min">Free before (min)</Label>
          <Input id="buffer_before_min" name="buffer_before_min" type="number" min={0} max={240} defaultValue={values.buffer_before_min} />
        </div>
        <div className="flex w-36 flex-col gap-2">
          <Label htmlFor="buffer_after_min">Free after (min)</Label>
          <Input id="buffer_after_min" name="buffer_after_min" type="number" min={0} max={240} defaultValue={values.buffer_after_min} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">
        Time kept free around each appointment for setting up or cleaning up. Customers don&apos;t see it.
      </p>

      {staff.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Who offers it</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="staff_mode"
              value="anyone"
              checked={staffMode === "anyone"}
              onChange={() => setStaffMode("anyone")}
            />
            Anyone on the team
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="staff_mode"
              value="chosen"
              checked={staffMode === "chosen"}
              onChange={() => setStaffMode("chosen")}
            />
            Only:
          </label>
          {staffMode === "chosen" && (
            <div className="ml-6 flex flex-wrap gap-x-4 gap-y-2">
              {staff.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="staff_ids" value={p.id} defaultChecked={values.staffIds.includes(p.id)} className="size-4" />
                  {p.name}
                  {!p.active && <span className="text-xs text-zinc-400">(inactive)</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input name="active" type="checkbox" defaultChecked={values.active} className="size-4" />
          Active: can be booked
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="online_bookable" type="checkbox" defaultChecked={values.online_bookable} className="size-4" />
          Show in the booking widgets on your website
        </label>
      </div>

      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : service ? "Save service" : "Add service"}
        </Button>
        {service && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function ServicesEditor({ initialServices, staff }: { initialServices: Service[]; staff: Staff[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Service | null>(null);
  // Remounts the add form after a save, clearing it.
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const staffName = new Map(staff.map((p) => [p.id, p.name]));

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? `Edit ${editing.name}` : "Add service"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceForm
            key={editing?.id ?? `new-${formKey}`}
            service={editing}
            staff={staff}
            onDone={() => {
              setEditing(null);
              setFormKey((k) => k + 1);
            }}
          />
        </CardContent>
      </Card>

      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-3">
        {initialServices.map((service, i) => (
          <Card key={service.id}>
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{service.name}</span>
                  {service.category && <Badge variant="outline">{service.category}</Badge>}
                  {!service.active && <Badge variant="secondary">Inactive</Badge>}
                  {service.active && !service.online_bookable && <Badge variant="secondary">Not on website</Badge>}
                </div>
                <p className="text-sm text-zinc-500">
                  {service.duration_minutes} min · {formatPrice(service.price_cents)}
                  {(service.buffer_before_min > 0 || service.buffer_after_min > 0) &&
                    ` · ${[
                      service.buffer_before_min && `${service.buffer_before_min} min free before`,
                      service.buffer_after_min && `${service.buffer_after_min} min free after`,
                    ]
                      .filter(Boolean)
                      .join(", ")}`}
                </p>
                {staff.length > 0 && (
                  <p className="text-xs text-zinc-400">
                    {service.staffIds.length
                      ? service.staffIds.map((id) => staffName.get(id)).filter(Boolean).join(", ")
                      : "Anyone on the team"}
                  </p>
                )}
                {service.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{service.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveServiceAction(service.id, "up"))}
                  aria-label={`Move ${service.name} up`}
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending || i === initialServices.length - 1}
                  onClick={() => run(() => moveServiceAction(service.id, "down"))}
                  aria-label={`Move ${service.name} down`}
                >
                  <ArrowDownIcon className="size-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(service)}>
                  Edit
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => deleteServiceAction(service.id))}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {initialServices.length === 0 && (
          <p className="text-center text-zinc-500">No services yet, so customers can&apos;t book anything.</p>
        )}
      </div>
    </div>
  );
}
