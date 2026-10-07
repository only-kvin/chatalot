"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addTimeOffAction,
  deleteStaffAction,
  deleteTimeOffAction,
  removeStaffPhotoAction,
  uploadStaffPhotoAction,
  setStaffServiceAction,
  switchToBusinessHoursAction,
  switchToOwnHoursAction,
  updateStaffAction,
} from "../actions";
import { describeTimeOff } from "@/lib/bookings/hours";
import { StaffAvatar } from "@/components/dashboard/staff-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Result = { error: string | null };

// Runs a server action, shows its error, refreshes the page's data on success.
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  function run(action: () => Promise<Result>, onDone?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      onDone?.();
      router.refresh();
    });
  }
  return { pending, error, saved, run };
}

function Feedback({ error, saved }: { error: string | null; saved?: boolean }) {
  if (error) return <p className="feedback-enter text-sm text-red-600">{error}</p>;
  if (saved) return <p className="feedback-enter text-sm text-green-600">Saved.</p>;
  return null;
}

export function StaffDetailsForm({
  staff,
  upcomingBookings,
  bookingsHref,
}: {
  staff: { id: string; name: string; role: string; avatar_url: string | null; active: boolean; max_concurrent: number };
  upcomingBookings: number;
  bookingsHref: string;
}) {
  const { pending, error, saved, run } = useAction();
  // Deactivating someone with bookings ahead takes a second, informed click.
  const [confirming, setConfirming] = useState(false);

  function submit(formData: FormData) {
    const deactivating = staff.active && formData.get("active") !== "on";
    if (deactivating && upcomingBookings > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    run(() => updateStaffAction(staff.id, formData));
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={staff.name} />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <Input id="role" name="role" defaultValue={staff.role} placeholder="Senior stylist" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="avatar_url">Photo link (optional)</Label>
        <Input
          id="avatar_url"
          name="avatar_url"
          type="url"
          defaultValue={staff.avatar_url ?? ""}
          placeholder="https://…/photo.jpg"
        />
        <p className="text-xs text-zinc-500">Shown to customers choosing who to book with. Initials are used without one.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="max_concurrent">Bookings at the same time</Label>
        <Input
          id="max_concurrent"
          name="max_concurrent"
          type="number"
          min={1}
          max={500}
          required
          defaultValue={staff.max_concurrent}
          className="w-28"
        />
        <p className="text-xs text-zinc-500">1 for a chair or a treatment room; more for a class (e.g. 12).</p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch name="active" defaultChecked={staff.active} />
        Active: customers can book {staff.name}
      </label>

      {confirming && (
        <div className="feedback-enter rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          {staff.name} has {upcomingBookings} upcoming booking{upcomingBookings === 1 ? "" : "s"}. They stay with{" "}
          {staff.name} until you move them.{" "}
          <Link href={bookingsHref} className="font-medium underline">
            See the bookings
          </Link>
          . Save again to deactivate anyway.
        </div>
      )}
      <Feedback error={error} saved={saved} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : confirming ? "Deactivate anyway" : "Save details"}
        </Button>
      </div>
    </form>
  );
}

export function StaffServices({
  staffId,
  services,
}: {
  staffId: string;
  services: { id: string; name: string; anyone: boolean; offered: boolean }[];
}) {
  const { pending, error, run } = useAction();
  if (services.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No services yet. Add them on the <Link href="/dashboard/services" className="underline">Services</Link> page.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {services.map((svc) => (
          <li key={svc.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={svc.offered}
                disabled={pending || svc.anyone}
                onChange={(e) => run(() => setStaffServiceAction(staffId, svc.id, e.target.checked))}
              />
              {svc.name}
              {svc.anyone && <span className="text-xs text-zinc-400">(everyone)</span>}
            </label>
          </li>
        ))}
      </ul>
      <Feedback error={error} />
    </div>
  );
}

export function HoursMode({ staffId, ownHours }: { staffId: string; ownHours: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      {ownHours ? (
        <div>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => switchToBusinessHoursAction(staffId))}>
            Use the opening hours instead
          </Button>
          <p className="mt-1 text-xs text-zinc-500">Removes these hours.</p>
        </div>
      ) : (
        <div>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => switchToOwnHoursAction(staffId))}>
            Set their own hours
          </Button>
          <p className="mt-1 text-xs text-zinc-500">Starts from a copy of the opening hours.</p>
        </div>
      )}
      <Feedback error={error} />
    </div>
  );
}

type TimeOffEntry = { id: string; starts_at: string; ends_at: string; reason: string };

export function TimeOff({ staffId, upcoming, past }: { staffId: string; upcoming: TimeOffEntry[]; past: TimeOffEntry[] }) {
  const { pending, error, run } = useAction();
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <form
        key={formKey}
        action={(formData) => run(() => addTimeOffAction(staffId, formData), () => setFormKey((k) => k + 1))}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="from_date">From</Label>
            <Input id="from_date" name="from_date" type="date" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="to_date">To (optional)</Label>
            <Input id="to_date" name="to_date" type="date" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="from_time">Part of the day: from</Label>
            <Input id="from_time" name="from_time" type="time" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="to_time">to</Label>
            <Input id="to_time" name="to_time" type="time" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">Reason (optional, only you see it)</Label>
            <Input id="reason" name="reason" placeholder="Annual leave" className="w-64" />
          </div>
          <Button type="submit" disabled={pending}>
            Add time off
          </Button>
        </div>
        <p className="text-xs text-zinc-500">Leave the times empty for whole days.</p>
      </form>
      <Feedback error={error} />

      {upcoming.length === 0 ? (
        <p className="text-sm text-zinc-500">No time off coming up.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {upcoming.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{describeTimeOff(t.starts_at, t.ends_at)}</span>
                {t.reason && <span className="ml-2 text-zinc-500">{t.reason}</span>}
              </span>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => deleteTimeOffAction(t.id))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="text-sm text-zinc-500">
          <summary className="cursor-pointer">Recent ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {past.map((t) => (
              <li key={t.id}>
                {describeTimeOff(t.starts_at, t.ends_at)}
                {t.reason && ` · ${t.reason}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function DeleteStaff({ staffId, name }: { staffId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {sure ? (
        <div className="flex items-center gap-2 text-sm">
          Delete {name}? Their hours and time off go too.
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteStaffAction(staffId);
                if (result.error) setError(result.error);
                else router.push("/dashboard/staff");
              })
            }
          >
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSure(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setSure(true)}>
            Delete {name}
          </Button>
          <p className="text-xs text-zinc-500">Only possible while they have no bookings; after that, deactivate them.</p>
        </div>
      )}
      {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function StaffPhoto({ staffId, name, url }: { staffId: string; name: string; url: string | null }) {
  const { pending, error, saved, run } = useAction();
  const [formKey, setFormKey] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <StaffAvatar name={name} url={url} className="size-16" />
      <form
        key={formKey}
        action={(formData) => run(() => uploadStaffPhotoAction(staffId, formData), () => setFormKey((k) => k + 1))}
        className="flex flex-wrap items-center gap-2"
      >
        <Label htmlFor="photo" className="sr-only">
          Photo
        </Label>
        <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="max-w-64" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading…" : url ? "Replace photo" : "Upload photo"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeStaffPhotoAction(staffId))}>
            Remove
          </Button>
        )}
      </form>
      <p className="w-full text-xs text-zinc-500">JPEG, PNG or WebP, up to 2 MB. Square photos look best.</p>
      <Feedback error={error} saved={saved} />
    </div>
  );
}
