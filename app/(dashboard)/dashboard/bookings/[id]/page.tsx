import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getSessionUser } from "@/lib/db/auth";
import { requireFeaturePage } from "@/lib/dashboard-features";
import { formatLocalDateTime, localDateISO } from "@/lib/time";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import {
  describeEvent,
  formatShortLocal,
  SOURCE_LABEL,
  STATUS_LABEL,
  statusVariant,
  type BookingStatus,
} from "@/lib/bookings/labels";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/dashboard/rating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingActions } from "./booking-actions";
import { AssignStaff } from "./assign-staff";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await requireFeaturePage("bookings");

  const supabase = await createClient();
  const user = await getSessionUser();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, name, phone, email, starts_at, ends_at, status, source, created_at, contact_id, conversation_id, staff_id, review_rating, services(name), conversations(channel)",
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!booking) notFound();

  const [{ data: events }, { data: staff }] = await Promise.all([
    supabase
      .from("booking_events")
      .select("type, actor, channel, details, created_by, created_at")
      .eq("tenant_id", tenantId)
      .eq("booking_id", id)
      .order("created_at"),
    supabase.from("staff").select("id, name, active").eq("tenant_id", tenantId).order("sort_order").order("name"),
  ]);
  const staffNames = new Map((staff ?? []).map((p) => [p.id, p.name]));
  const staffName = booking.staff_id ? staffNames.get(booking.staff_id) : null;

  const service = (booking.services as unknown as { name: string } | null)?.name ?? "Booking";
  const chatChannel = (booking.conversations as unknown as { channel: string } | null)?.channel ?? null;
  const started = new Date(booking.starts_at) <= new Date();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link
          href="/dashboard/bookings"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> Bookings
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{service}</h1>
          <Badge variant={statusVariant(booking.status)}>
            {STATUS_LABEL[booking.status as BookingStatus] ?? booking.status}
          </Badge>
          {booking.review_rating && <Rating value={booking.review_rating} />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLocalDateTime(booking.starts_at)} – {formatLocalDateTime(booking.ends_at).split(" at ")[1]}
          {staffName && ` · with ${staffName}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {booking.contact_id ? (
              <Link href={`/dashboard/customers/${booking.contact_id}`} className="hover:underline">
                {booking.name}
              </Link>
            ) : (
              booking.name
            )}
          </p>
          <p>{formatPhone(canonicalPhone(booking.phone)) || booking.phone}</p>
          {booking.email && <p>{booking.email}</p>}
          <p className="text-muted-foreground">
            Booked via {SOURCE_LABEL[booking.source] ?? booking.source} on {formatShortLocal(booking.created_at)}
            {booking.conversation_id && (
              <>
                {" · "}
                <Link href={`/dashboard/conversations/${booking.conversation_id}`} className="hover:underline">
                  View chat
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 border-l pl-4 text-sm">
            {events?.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-muted-foreground/60" aria-hidden />
                <p>{describeEvent(e, user?.id ?? null, staffNames)}</p>
                <p className="text-xs text-muted-foreground">{formatShortLocal(e.created_at)}</p>
              </li>
            ))}
            {!events?.length && <li className="text-muted-foreground">No history recorded.</li>}
          </ol>
        </CardContent>
      </Card>

      {(booking.status === "confirmed" || booking.status === "pending") && !started && staffNames.size > 0 && (
        <Card>
          <CardContent className="pt-6">
            <AssignStaff
              bookingId={booking.id}
              currentStaffId={booking.staff_id}
              staff={(staff ?? []).filter((p) => p.active || p.id === booking.staff_id)}
            />
          </CardContent>
        </Card>
      )}

      <BookingActions
        bookingId={booking.id}
        status={booking.status}
        started={started}
        canMessageOnWhatsApp={chatChannel === "whatsapp"}
        defaultDate={localDateISO(new Date(booking.starts_at))}
      />
    </div>
  );
}
