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
import { Switch } from "@/components/ui/switch";
import { calloutFeeNotice, priceLabel, type PriceType, type ServiceLocation } from "@/lib/bookings/price-label";

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
  location: ServiceLocation;
  price_type: PriceType;
  callout_fee_cents: number | null;
  arrival_window_minutes: number | null;
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
  location: "business",
  price_type: "fixed",
  callout_fee_cents: null,
  arrival_window_minutes: null,
  staffIds: [],
};

const LOCATION_LABEL: Record<ServiceLocation, string> = {
  business: "At your place of business",
  customer: "At the customer's address",
  either: "Either: the customer chooses",
};

const WINDOWS = [
  { value: "", label: "Exact start time" },
  { value: "60", label: "1-hour window" },
  { value: "120", label: "2-hour window" },
  { value: "180", label: "3-hour window" },
  { value: "240", label: "4-hour window" },
  { value: "480", label: "Morning or afternoon (8 hours)" },
];

const toRand = (cents: number | null) => (cents !== null ? (cents / 100).toFixed(2) : "");
const fromRand = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);

// The customer-facing line, from the same helper the AI and widgets use.
function priceSummary(s: Pick<Service, "price_type" | "price_cents" | "callout_fee_cents" | "location">): string {
  return (
    priceLabel(
      { priceType: s.price_type, priceCents: s.price_cents, calloutFeeCents: s.callout_fee_cents },
      s.location !== "business",
    ) ?? "Price not set"
  );
}

function ServiceForm({
  service,
  staff,
  businessName,
  onDone,
}: {
  service: Service | null;
  staff: Staff[];
  businessName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const values = service ?? BLANK;
  const [staffMode, setStaffMode] = useState<"anyone" | "chosen">(values.staffIds.length ? "chosen" : "anyone");
  // Drive the live price preview.
  const [location, setLocation] = useState<ServiceLocation>(values.location);
  const [priceType, setPriceType] = useState<PriceType>(values.price_type);
  const [priceRand, setPriceRand] = useState(toRand(values.price_cents));
  const [feeRand, setFeeRand] = useState(toRand(values.callout_fee_cents));
  const comesToCustomer = location !== "business";
  const preview = {
    price_type: priceType,
    price_cents: priceType === "on_inspection" ? null : fromRand(priceRand),
    callout_fee_cents: comesToCustomer ? fromRand(feeRand) : null,
    location,
  };

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
            disabled={priceType === "on_inspection"}
            value={priceType === "on_inspection" ? "" : priceRand}
            onChange={(e) => setPriceRand(e.target.value)}
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
      <p className="-mt-2 text-xs text-muted-foreground">
        Time kept free around each appointment for setting up or cleaning up. Customers don&apos;t see it.
      </p>

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="location">Where it happens</Label>
          <select
            id="location"
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value as ServiceLocation)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {(Object.keys(LOCATION_LABEL) as ServiceLocation[]).map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-2">
          <Label htmlFor="price_type">Price type</Label>
          <select
            id="price_type"
            name="price_type"
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as PriceType)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="fixed">Fixed price</option>
            <option value="from">From a price</option>
            <option value="on_inspection">Quoted on site</option>
          </select>
        </div>
      </div>
      {comesToCustomer && (
        <div className="flex flex-wrap gap-4">
          <div className="flex w-44 flex-col gap-2">
            <Label htmlFor="callout_fee_rand">Call-out fee (R, optional)</Label>
            <Input
              id="callout_fee_rand"
              name="callout_fee_rand"
              type="number"
              min={0}
              step="0.01"
              value={feeRand}
              onChange={(e) => setFeeRand(e.target.value)}
            />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-2">
            <Label htmlFor="arrival_window_minutes">Arrival time</Label>
            <select
              id="arrival_window_minutes"
              name="arrival_window_minutes"
              defaultValue={values.arrival_window_minutes ? String(values.arrival_window_minutes) : ""}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="rounded-md border border-dashed px-3 py-2 text-sm" aria-live="polite">
        <span className="text-muted-foreground">Customers see: </span>
        <span className="font-medium">{priceSummary(preview)}</span>
        {comesToCustomer && preview.callout_fee_cents ? (
          <span className="block text-xs text-muted-foreground">
            Before booking: &ldquo;{calloutFeeNotice(preview.callout_fee_cents, businessName)}&rdquo;
          </span>
        ) : null}
        {location === "either" && (
          <span className="block text-xs text-muted-foreground">The call-out fee and window only apply when they choose &ldquo;at yours&rdquo;.</span>
        )}
      </div>

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
                  {!p.active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 text-sm">
          <Switch name="active" defaultChecked={values.active} />
          Active: can be booked
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch name="online_bookable" defaultChecked={values.online_bookable} />
          Show in the booking widgets on your website
        </label>
      </div>

      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} data-echo="services.save">
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

export function ServicesEditor({
  initialServices,
  staff,
  businessName,
}: {
  initialServices: Service[];
  staff: Staff[];
  businessName: string;
}) {
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
            businessName={businessName}
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
                  {service.location === "customer" && <Badge variant="outline">Call-out</Badge>}
                  {service.location === "either" && <Badge variant="outline">Here or at theirs</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {service.duration_minutes} min · {priceSummary(service)}
                  {service.location !== "business" &&
                    service.arrival_window_minutes &&
                    ` · ${service.arrival_window_minutes / 60}-hour arrival window`}
                  {(service.buffer_before_min > 0 || service.buffer_after_min > 0) &&
                    ` · ${[
                      service.buffer_before_min && `${service.buffer_before_min} min free before`,
                      service.buffer_after_min && `${service.buffer_after_min} min free after`,
                    ]
                      .filter(Boolean)
                      .join(", ")}`}
                </p>
                {staff.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {service.staffIds.length
                      ? service.staffIds.map((id) => staffName.get(id)).filter(Boolean).join(", ")
                      : "Anyone on the team"}
                  </p>
                )}
                {service.description && <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>}
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
                <Button variant="outline" size="sm" onClick={() => setEditing(service)} data-echo="services.edit">
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
          <p className="text-center text-muted-foreground">No services yet, so customers can&apos;t book anything.</p>
        )}
      </div>
    </div>
  );
}
