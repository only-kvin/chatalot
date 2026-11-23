"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStaffAction, removeStaffAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddStaffForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      ref={form}
      action={(fd) =>
        startTransition(async () => {
          const r = await addStaffAction(fd);
          setError(r.error);
          if (!r.error) {
            form.current?.reset();
            router.refresh();
          }
        })
      }
      className="flex flex-col gap-2"
    >
      <div className="flex max-w-lg gap-2">
        <Input name="email" type="email" required placeholder="their@email.com" aria-label="Staff email" />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function RemoveStaffButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeStaffAction(userId);
          router.refresh();
        })
      }
    >
      Remove
    </Button>
  );
}
