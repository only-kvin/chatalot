import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatShortLocal } from "@/lib/bookings/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageFrame } from "@/components/dashboard/page-frame";
import { AddStaffForm, RemoveStaffButton } from "./staff-controls";

// Platform staff: the team building businesses' websites. They can use the
// studio (find any business, set up its widgets, copy embed codes) but not
// /admin. The admin layout already limits this page to platform admins.
export default async function StaffPage() {
  const admin = createAdminClient();
  const { data: staff } = await admin.from("platform_staff").select("user_id, created_at").order("created_at");
  const people = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data } = await admin.auth.admin.getUserById(s.user_id);
      return { userId: s.user_id, email: data.user?.email ?? "(account deleted)", since: s.created_at };
    }),
  );

  return (
    <div className={pageFrame("form", "flex flex-col gap-6")}>
      <div>
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Admin
        </Link>
        <h1 className="text-2xl font-semibold">Platform staff</h1>
        <p className="text-sm text-muted-foreground">
          Your website team. They can open <Link href="/studio" className="underline">/studio</Link> to find any business, create its widgets and copy
          embed codes. They can&apos;t see conversations, customers, plans or usage.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add someone</CardTitle>
          <CardDescription>They need an account first: ask them to sign in once at /login.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddStaffForm />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {people.map((p) => (
            <div key={p.userId} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium">{p.email}</p>
                <p className="text-xs text-muted-foreground">Since {formatShortLocal(p.since)}</p>
              </div>
              <RemoveStaffButton userId={p.userId} />
            </div>
          ))}
          {!people.length && <p className="px-5 py-8 text-center text-muted-foreground">No staff yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
