"use client";

import { useState, useTransition } from "react";
import { createServiceAction, updateServiceAction, deleteServiceAction } from "./actions";
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
  duration_minutes: number;
  price_cents: number | null;
  active: boolean;
};

function formatPrice(cents: number | null): string {
  return cents === null ? "Price not set" : `R${(cents / 100).toFixed(2)}`;
}

export function ServicesEditor({ initialServices }: { initialServices: Service[] }) {
  const [services, setServices] = useState(initialServices);
  const [editing, setEditing] = useState<Service | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditing = editing !== null;
  const formValues =
    editing ?? { name: "", description: "", duration_minutes: 30, price_cents: null, active: true };

  function resetForm() {
    setEditing(null);
    setError(null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEditing) {
          formData.set("id", editing!.id);
          await updateServiceAction(formData);
        } else {
          await createServiceAction(formData);
        }
        // revalidatePath refreshes server data on next navigation — reload to
        // see the change reflected immediately (same approach as knowledge editor).
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteServiceAction(formData);
      setServices((prev) => prev.filter((s) => s.id !== id));
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit service" : "Add service"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={formValues.name}
                key={`name-${editing?.id ?? "new"}`}
                placeholder="Haircut"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={formValues.description}
                key={`description-${editing?.id ?? "new"}`}
                placeholder="Wash, cut and blow-dry"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="duration_minutes">Duration (minutes)</Label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min={1}
                  required
                  defaultValue={formValues.duration_minutes}
                  key={`duration-${editing?.id ?? "new"}`}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="price_rand">Price (R, optional)</Label>
                <Input
                  id="price_rand"
                  name="price_rand"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    formValues.price_cents !== null ? (formValues.price_cents / 100).toFixed(2) : ""
                  }
                  key={`price-${editing?.id ?? "new"}`}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={formValues.active}
                key={`active-${editing?.id ?? "new"}`}
                className="h-4 w-4"
              />
              <Label htmlFor="active">Bookable by the AI receptionist</Label>
            </div>
            {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : isEditing ? "Update service" : "Add service"}
              </Button>
              {isEditing && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {services.map((service) => (
          <Card key={service.id}>
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={service.active ? "default" : "secondary"}>
                    {service.active ? "active" : "inactive"}
                  </Badge>
                  <span className="font-medium">{service.name}</span>
                  <span className="text-sm text-zinc-500">
                    {service.duration_minutes} min · {formatPrice(service.price_cents)}
                  </span>
                </div>
                {service.description && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{service.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(service)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleDelete(service.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {services.length === 0 && (
          <p className="text-center text-zinc-500">No services yet — visitors can&apos;t book anything.</p>
        )}
      </div>
    </div>
  );
}
