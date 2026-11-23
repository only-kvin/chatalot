"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";
import { featureError } from "@/lib/dashboard-features";
import { imageKind } from "@/lib/staff/photo";
import { localToUtcDate } from "@/lib/time";

// Dashboard → Events. Members of the business create and edit events, upload
// posters, duplicate, cancel, and cancel sign-ups. The signed-in user's
// client (RLS) does the database work; posters go to storage with the
// service role after the event is confirmed to be theirs.

type Result = { error: string | null; id?: string };

const POSTER_BUCKET = "event-posters";
// Vercel accepts request bodies up to 4.5 MB, upload included.
const MAX_POSTER_BYTES = 4 * 1024 * 1024;
const uuid = z.string().uuid();

async function session() {
  const blocked = await featureError("events");
  if (blocked) return { error: blocked } as const;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." } as const;
  return { tenantId, supabase: await createClient() } as const;
}

function failed(what: string, err: unknown): Result {
  console.error(`Events: ${what} failed:`, err);
  return { error: `Couldn't ${what}. Please try again.` };
}

function revalidate(id?: string) {
  revalidatePath("/dashboard/events");
  if (id) revalidatePath(`/dashboard/events/${id}`);
}

const rand = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 1), `${label}: enter an amount like 150 or 150.00 (at least R1)`);

const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Give the event a title").max(120),
    summary: z.string().trim().max(300),
    description: z.string().trim().max(5000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    start: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
    end: z.string().regex(/^(\d{2}:\d{2})?$/),
    location: z.string().trim().max(300),
    capacity: z.string().trim().regex(/^\d{0,6}$/, "Spots: a whole number, or leave empty for no limit"),
    max_per_signup: z.coerce.number().int().min(1, "At least 1 ticket per sign-up").max(20, "At most 20 tickets per sign-up"),
    price: rand("Ticket price"),
    signups_open: z.boolean(),
    status: z.enum(["draft", "published"]),
  })
  .refine((d) => !d.end || d.end > d.start, { message: "The end time must be after the start", path: ["end"] });

function parseForm(formData: FormData) {
  return eventSchema.safeParse({
    title: formData.get("title") ?? "",
    summary: formData.get("summary") ?? "",
    description: formData.get("description") ?? "",
    date: formData.get("date") ?? "",
    start: formData.get("start") ?? "",
    end: formData.get("end") ?? "",
    location: formData.get("location") ?? "",
    capacity: formData.get("capacity") ?? "",
    max_per_signup: formData.get("max_per_signup") || 1,
    price: formData.get("price") ?? "",
    signups_open: formData.get("signups_open") === "on",
    status: formData.get("status") === "published" ? "published" : "draft",
  });
}

function toRecord(d: z.infer<typeof eventSchema>) {
  return {
    title: d.title,
    summary: d.summary,
    description: d.description,
    // Times are typed in SA time.
    starts_at: localToUtcDate(d.date, d.start).toISOString(),
    ends_at: d.end ? localToUtcDate(d.date, d.end).toISOString() : null,
    location: d.location,
    capacity: d.capacity ? Number(d.capacity) || null : null,
    max_per_signup: d.max_per_signup,
    price_cents: d.price ? Math.round(Number(d.price) * 100) : null,
    signups_open: d.signups_open,
    status: d.status,
  };
}

export async function saveEventAction(eventId: string | null, formData: FormData): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the event details." };
  const record = { ...toRecord(parsed.data), updated_at: new Date().toISOString() };

  if (eventId) {
    if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };
    // A cancelled event stays cancelled; editing it doesn't reopen it.
    const { data: current } = await s.supabase.from("events").select("status").eq("tenant_id", s.tenantId).eq("id", eventId).maybeSingle();
    if (!current) return { error: "Event not found." };
    const { error } = await s.supabase
      .from("events")
      .update(current.status === "cancelled" ? { ...record, status: "cancelled" } : record)
      .eq("tenant_id", s.tenantId)
      .eq("id", eventId);
    if (error) return failed("save the event", error);
    revalidate(eventId);
    return { error: null, id: eventId };
  }
  const user = await getSessionUser();
  const { data, error } = await s.supabase
    .from("events")
    .insert({ tenant_id: s.tenantId, ...record, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) return failed("create the event", error);
  revalidate(data.id);
  return { error: null, id: data.id };
}

// A copy as a Draft, a week later, with the same poster: the quick way to
// run the same event again.
export async function duplicateEventAction(eventId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };
  const { data: e } = await s.supabase
    .from("events")
    .select("title, summary, description, starts_at, ends_at, location, poster_path, capacity, max_per_signup, price_cents")
    .eq("tenant_id", s.tenantId)
    .eq("id", eventId)
    .maybeSingle();
  if (!e) return { error: "Event not found." };
  const week = 7 * 24 * 3600_000;
  const user = await getSessionUser();
  const { data, error } = await s.supabase
    .from("events")
    .insert({
      ...e,
      tenant_id: s.tenantId,
      starts_at: new Date(new Date(e.starts_at).getTime() + week).toISOString(),
      ends_at: e.ends_at ? new Date(new Date(e.ends_at).getTime() + week).toISOString() : null,
      status: "draft",
      signups_open: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return failed("duplicate the event", error);
  revalidate(data.id);
  return { error: null, id: data.id };
}

// Cancelled: shown as cancelled on the website, no more sign-ups. Existing
// sign-ups stay listed so the business can contact (and refund) them.
export async function cancelEventAction(eventId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };
  const { error } = await s.supabase
    .from("events")
    .update({ status: "cancelled", signups_open: false, updated_at: new Date().toISOString() })
    .eq("tenant_id", s.tenantId)
    .eq("id", eventId);
  if (error) return failed("cancel the event", error);
  revalidate(eventId);
  return { error: null };
}

// Only events nobody has signed up for can be deleted; otherwise cancel.
export async function deleteEventAction(eventId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };
  const { count } = await s.supabase
    .from("event_signups")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", s.tenantId)
    .eq("event_id", eventId);
  if (count) return { error: "People have signed up for this event, so it can't be deleted. Cancel it instead." };
  const { data: e } = await s.supabase.from("events").select("poster_path").eq("tenant_id", s.tenantId).eq("id", eventId).maybeSingle();
  const { error } = await s.supabase.from("events").delete().eq("tenant_id", s.tenantId).eq("id", eventId);
  if (error) return failed("delete the event", error);
  await removePoster(e?.poster_path ?? null, s.tenantId);
  revalidate();
  return { error: null };
}

export async function cancelSignupAction(eventId: string, signupId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(signupId).success) return { error: "Invalid request." };
  const { error } = await s.supabase
    .from("event_signups")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("tenant_id", s.tenantId)
    .eq("event_id", eventId)
    .eq("id", signupId);
  if (error) return failed("cancel the sign-up", error);
  revalidate(eventId);
  return { error: null };
}

// A poster we host, removed when it's replaced; only this business's files
// (and only when no other event, e.g. a duplicate, still uses it).
async function removePoster(path: string | null, tenantId: string) {
  if (!path || !path.startsWith(`${tenantId}/`)) return;
  const admin = createAdminClient();
  const { count } = await admin.from("events").select("id", { count: "exact", head: true }).eq("poster_path", path);
  if (count) return;
  await admin.storage.from(POSTER_BUCKET).remove([path]);
}

export async function uploadPosterAction(eventId: string, formData: FormData): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };
  const file = formData.get("poster");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (file.size > MAX_POSTER_BYTES) return { error: "That image is over 4 MB. Please choose a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(bytes);
  if (!kind) return { error: "Use a JPEG, PNG or WebP image." };

  const { data: e } = await s.supabase.from("events").select("id, poster_path").eq("tenant_id", s.tenantId).eq("id", eventId).maybeSingle();
  if (!e) return { error: "Event not found." };

  const admin = createAdminClient();
  const path = `${s.tenantId}/${eventId}-${crypto.randomUUID()}.${kind.ext}`;
  const { error: uploadError } = await admin.storage
    .from(POSTER_BUCKET)
    .upload(path, bytes, { contentType: kind.contentType, cacheControl: "31536000", upsert: false });
  if (uploadError) return failed("upload the poster", uploadError);
  const { error } = await s.supabase
    .from("events")
    .update({ poster_path: path, updated_at: new Date().toISOString() })
    .eq("tenant_id", s.tenantId)
    .eq("id", eventId);
  if (error) {
    await admin.storage.from(POSTER_BUCKET).remove([path]);
    return failed("save the poster", error);
  }
  await removePoster(e.poster_path, s.tenantId);
  revalidate(eventId);
  return { error: null };
}

export async function removePosterAction(eventId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  if (!uuid.safeParse(eventId).success) return { error: "Invalid event." };
  const { data: e } = await s.supabase.from("events").select("poster_path").eq("tenant_id", s.tenantId).eq("id", eventId).maybeSingle();
  if (!e) return { error: "Event not found." };
  const { error } = await s.supabase.from("events").update({ poster_path: null }).eq("tenant_id", s.tenantId).eq("id", eventId);
  if (error) return failed("remove the poster", error);
  await removePoster(e.poster_path, s.tenantId);
  revalidate(eventId);
  return { error: null };
}
