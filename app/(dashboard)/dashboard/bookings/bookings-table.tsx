"use client";

import { useTransition } from "react";
import { updateBookingStatusAction } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Booking = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  starts_at: string;
  status: "confirmed" | "cancelled" | "completed";
  service_name: string;
};

const STATUSES: Booking["status"][] = ["confirmed", "cancelled", "completed"];

export function BookingsTable({ bookings }: { bookings: Booking[] }) {
  const [pending, startTransition] = useTransition();

  function handleStatusChange(id: string, status: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("status", status);
      await updateBookingStatusAction(formData);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((booking) => (
          <TableRow key={booking.id}>
            <TableCell>
              {new Date(booking.starts_at).toLocaleString("en-ZA", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </TableCell>
            <TableCell>{booking.service_name}</TableCell>
            <TableCell>
              {booking.name}
              <br />
              <span className="text-sm text-zinc-500">
                {booking.phone}
                {booking.email ? ` / ${booking.email}` : ""}
              </span>
            </TableCell>
            <TableCell>
              <Select
                defaultValue={booking.status}
                disabled={pending}
                onValueChange={(value) => value && handleStatusChange(booking.id, value)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          </TableRow>
        ))}
        {bookings.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-zinc-500">
              No bookings yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
