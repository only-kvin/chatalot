import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { formatRand } from "@/lib/bookings/price-label";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageFrame } from "@/components/dashboard/page-frame";
import { timetableLabel } from "./labels";

// Dashboard → Classes: the weekly timetable. Each class creates its sessions
// eight weeks ahead; open one to see them and who's booked.
export default async function ClassesPage() {
  const tenantId = await requireFeaturePage("events");
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("class_series")
    .select("id, title, weekdays, start_time, duration_minutes, capacity, price_cents, active, staff(name)")
    .eq("tenant_id", tenantId)
    .order("active", { ascending: false })
    .order("title");

  return (
    <div className={pageFrame("wide")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Classes" description="Your weekly timetable. Sessions are created eight weeks ahead and shown in the Find a Class widget." />
        <Link href="/dashboard/classes/new" className={buttonVariants()}>
          New class
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Instructor</TableHead>
            <TableHead>Spots</TableHead>
            <TableHead>Drop-in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(classes ?? []).map((c) => (
            <TableRow key={c.id} className={c.active ? "" : "text-muted-foreground"}>
              <TableCell>
                <Link href={`/dashboard/classes/${c.id}`} className="font-medium hover:underline">
                  {c.title}
                </Link>
                {!c.active && (
                  <Badge variant="secondary" className="ml-2">
                    Off the timetable
                  </Badge>
                )}
              </TableCell>
              <TableCell>{timetableLabel(c)}</TableCell>
              <TableCell>{(c.staff as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
              <TableCell>{c.capacity ?? "No limit"}</TableCell>
              <TableCell>{c.price_cents ? formatRand(c.price_cents) : "Free"}</TableCell>
            </TableRow>
          ))}
          {!classes?.length && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No classes yet. Create one to put it on your timetable.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
