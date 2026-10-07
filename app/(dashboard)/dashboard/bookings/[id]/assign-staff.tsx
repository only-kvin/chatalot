"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignStaffAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Gives an upcoming booking to someone else at the same time.
export function AssignStaff({
  bookingId,
  currentStaffId,
  staff,
}: {
  bookingId: string;
  currentStaffId: string | null;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState(currentStaffId ?? "");

  function assign() {
    setError(null);
    startTransition(async () => {
      const result = await assignStaffAction(bookingId, choice);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="assign-staff">Staff member</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="assign-staff"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          {!currentStaffId && <option value="">Not assigned</option>}
          {staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={pending || !choice || choice === currentStaffId} onClick={assign}>
          {pending ? "Saving…" : "Give to them"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Same time; they must be working and free then. The customer isn&apos;t messaged.</p>
      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
    </div>
  );
}
