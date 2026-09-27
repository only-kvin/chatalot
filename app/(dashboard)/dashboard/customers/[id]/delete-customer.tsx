"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { deleteCustomerAction } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// For POPIA deletion requests: removes the customer and everything about them.
export function DeleteCustomer({
  id,
  name,
  counts,
}: {
  id: string;
  name: string;
  counts: { conversations: number; leads: number; bookings: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomerAction(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push("/dashboard/customers");
    });
  }

  return (
    <div className="rounded-xl border border-red-200 p-4 dark:border-red-900">
      <p className="text-sm font-medium">Delete customer and their data</p>
      <p className="mt-1 text-sm text-zinc-500">
        Use this when someone asks you to delete their information. It can&apos;t be undone.
      </p>
      <Button variant="destructive" className="mt-3" onClick={() => setOpen(true)}>
        <Trash2Icon className="size-4" /> Delete customer
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the customer along with {plural(counts.conversations, "conversation")}{" "}
              (every message in them), {plural(counts.leads, "lead")} and {plural(counts.bookings, "booking")}.
              It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
