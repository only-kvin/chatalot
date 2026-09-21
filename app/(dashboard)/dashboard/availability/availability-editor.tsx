"use client";

import { useState, useTransition } from "react";
import {
  createAvailabilityRuleAction,
  deleteAvailabilityRuleAction,
  createAvailabilityExceptionAction,
  deleteAvailabilityExceptionAction,
} from "./actions";
import { WEEKDAY_NAMES } from "@/lib/agent/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Rule = { id: string; weekday: number; start_time: string; end_time: string };
type Exception = {
  id: string;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
};

function formatTime(t: string): string {
  return t.slice(0, 5);
}

export function AvailabilityEditor({
  initialRules,
  initialExceptions,
}: {
  initialRules: Rule[];
  initialExceptions: Exception[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAddRule(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createAvailabilityRuleAction(formData);
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleDeleteRule(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteAvailabilityRuleAction(formData);
      setRules((prev) => prev.filter((r) => r.id !== id));
    });
  }

  function handleAddException(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createAvailabilityExceptionAction(formData);
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleDeleteException(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteAvailabilityExceptionAction(formData);
      setExceptions((prev) => prev.filter((e) => e.id !== id));
    });
  }

  const sortedRules = [...rules].sort(
    (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
  );
  const sortedExceptions = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={handleAddRule} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="weekday">Day</Label>
              <Select name="weekday" defaultValue="1">
                <SelectTrigger id="weekday" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="start_time">From</Label>
              <Input id="start_time" name="start_time" type="time" required defaultValue="09:00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end_time">To</Label>
              <Input id="end_time" name="end_time" type="time" required defaultValue="17:00" />
            </div>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </form>
          {error && <p className="feedback-enter text-sm text-red-600">{error}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{WEEKDAY_NAMES[rule.weekday]}</TableCell>
                  <TableCell>
                    {formatTime(rule.start_time)} – {formatTime(rule.end_time)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sortedRules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-zinc-500">
                    No open hours set — the AI receptionist can&apos;t offer any bookings yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exceptions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={handleAddException} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="exc_start_time">From (leave blank if closed)</Label>
              <Input id="exc_start_time" name="start_time" type="time" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="exc_end_time">To</Label>
              <Input id="exc_end_time" name="end_time" type="time" />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                id="is_closed"
                name="is_closed"
                type="checkbox"
                defaultChecked
                className="h-4 w-4"
              />
              <Label htmlFor="is_closed">Closed all day</Label>
            </div>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExceptions.map((exc) => (
                <TableRow key={exc.id}>
                  <TableCell>{exc.date}</TableCell>
                  <TableCell>
                    {exc.is_closed
                      ? "Closed"
                      : `${formatTime(exc.start_time!)} – ${formatTime(exc.end_time!)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleDeleteException(exc.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sortedExceptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-zinc-500">
                    No exceptions.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
