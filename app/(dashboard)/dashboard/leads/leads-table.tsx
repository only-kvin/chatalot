"use client";

import { useTransition } from "react";
import { updateLeadStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
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
import { formatShortLocal } from "@/lib/time";
import { localDateISO } from "@/lib/time";

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  status: "new" | "contacted" | "booked" | "won" | "lost";
  source: string;
  created_at: string;
};

const STATUSES: Lead["status"][] = ["new", "contacted", "booked", "won", "lost"];

function toCsv(leads: Lead[]): string {
  const header = ["Name", "Phone", "Email", "Interest", "Status", "Source", "Created"];
  const rows = leads.map((l) => [
    l.name ?? "",
    l.phone ?? "",
    l.email ?? "",
    l.interest ?? "",
    l.status,
    l.source,
    l.created_at,
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map((v) => escape(String(v))).join(",")).join("\n");
}

function downloadCsv(leads: Lead[]) {
  const csv = toCsv(leads);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${localDateISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [pending, startTransition] = useTransition();

  function handleStatusChange(id: string, status: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("status", status);
      await updateLeadStatusAction(formData);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => downloadCsv(leads)}>
          Export CSV
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell>{lead.name}</TableCell>
              <TableCell>
                {lead.phone}
                {lead.email ? ` / ${lead.email}` : ""}
              </TableCell>
              <TableCell>{lead.interest}</TableCell>
              <TableCell>
                <Select
                  defaultValue={lead.status}
                  disabled={pending}
                  onValueChange={(value) => value && handleStatusChange(lead.id, value)}
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
              <TableCell>{formatShortLocal(lead.created_at)}</TableCell>
            </TableRow>
          ))}
          {leads.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-zinc-500">
                No leads yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
