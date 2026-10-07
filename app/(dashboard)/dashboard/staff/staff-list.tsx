"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { createStaffAction, moveStaffAction } from "./actions";
import { StaffAvatar } from "@/components/dashboard/staff-avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type StaffRow = {
  id: string;
  name: string;
  role: string;
  avatar_url: string | null;
  active: boolean;
  max_concurrent: number;
  services: string[];
  ownHours: boolean;
};

export function StaffList({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createStaffAction(formData);
      if (result.error) setError(result.error);
      // Straight to their page to set services, hours and time off.
      else if (result.id) router.push(`/dashboard/staff/${result.id}`);
    });
  }

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveStaffAction(id, direction);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add someone</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={add} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-staff-name">Name</Label>
              <Input id="new-staff-name" name="name" required placeholder="Thandi" className="w-48" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-staff-role">Role (optional)</Label>
              <Input id="new-staff-role" name="role" placeholder="Senior stylist" className="w-48" />
            </div>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}

      {staff.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No staff yet. Customers book the business as a whole, one booking at a time.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {staff.map((p, i) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex items-center gap-4 pt-6">
                  <StaffAvatar name={p.name} url={p.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/staff/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.role && <span className="text-sm text-muted-foreground">{p.role}</span>}
                      {!p.active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {p.services.length ? p.services.join(", ") : "No services"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.ownHours ? "Own hours" : "Opening hours"}
                      {p.max_concurrent > 1 && ` · up to ${p.max_concurrent} bookings at a time`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending || i === 0}
                      onClick={() => move(p.id, "up")}
                      aria-label={`Move ${p.name} up`}
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending || i === staff.length - 1}
                      onClick={() => move(p.id, "down")}
                      aria-label={`Move ${p.name} down`}
                    >
                      <ArrowDownIcon className="size-4" />
                    </Button>
                    <Link href={`/dashboard/staff/${p.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Edit
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
