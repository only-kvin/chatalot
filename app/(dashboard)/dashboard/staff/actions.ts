"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { timeOffRange } from "@/lib/bookings/hours";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { imageKind, MAX_PHOTO_BYTES, PHOTO_BUCKET, storedPhotoPath } from "@/lib/staff/photo";
import { featureError } from "@/lib/dashboard-features";

// Staff, their services, hours and time off. The signed-in user's client is
// used throughout, so RLS keeps every read and write inside their business;
// staff ids from another business also fail the (tenant_id, staff_id)
// foreign keys. Results are returned, not thrown (Next.js hides thrown
// messages in production).

type Result = { error: string | null };

const uuid = z.string().uuid();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const detailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  role: z.string().trim().max(80),
  avatar_url: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "The photo link must start with https://"),
  max_concurrent: z.coerce.number().int().min(1, "At least 1 booking at a time").max(500),
  active: z.boolean(),
});

async function session() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return null;
  return { tenantId, supabase: await createClient() };
}

function revalidate(staffId?: string) {
  revalidatePath("/dashboard/staff");
  if (staffId) revalidatePath(`/dashboard/staff/${staffId}`);
}

function failed(what: string, err: unknown): Result {
  console.error(`Staff: ${what} failed:`, err);
  return { error: `Couldn't ${what}. Please try again.` };
}

export async function createStaffAction(formData: FormData): Promise<Result & { id?: string }> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  const parsed = detailsSchema.pick({ name: true, role: true }).safeParse({
    name: formData.get("name") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  // New people go to the end of the list.
  const { data: last } = await s.supabase
    .from("staff")
    .select("sort_order")
    .eq("tenant_id", s.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await s.supabase
    .from("staff")
    .insert({ tenant_id: s.tenantId, ...parsed.data, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return failed("add that person", error);
  revalidate();
  return { error: null, id: data.id };
}

export async function updateStaffAction(staffId: string, formData: FormData): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };
  const parsed = detailsSchema.safeParse({
    name: formData.get("name") ?? "",
    role: formData.get("role") ?? "",
    avatar_url: formData.get("avatar_url") ?? "",
    max_concurrent: formData.get("max_concurrent") ?? 1,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { error } = await s.supabase
    .from("staff")
    .update({ ...parsed.data, avatar_url: parsed.data.avatar_url || null })
    .eq("id", staffId)
    .eq("tenant_id", s.tenantId);
  if (error) return failed("save those details", error);
  revalidate(staffId);
  return { error: null };
}

// Swaps a person with their neighbour in the order customers see.
export async function moveStaffAction(staffId: string, direction: "up" | "down"): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };

  const { data: staff, error } = await s.supabase
    .from("staff")
    .select("id, sort_order")
    .eq("tenant_id", s.tenantId)
    .order("sort_order")
    .order("name");
  if (error || !staff) return failed("reorder", error);
  const i = staff.findIndex((p) => p.id === staffId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= staff.length) return { error: null };

  // Renumber everyone so equal sort_orders can't make the swap a no-op.
  const order = staff.map((p) => p.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [index, id] of order.entries()) {
    const { error: updateError } = await s.supabase
      .from("staff")
      .update({ sort_order: index + 1 })
      .eq("id", id)
      .eq("tenant_id", s.tenantId);
    if (updateError) return failed("reorder", updateError);
  }
  revalidate();
  return { error: null };
}

// Only for someone who never had a booking; anyone else is deactivated, so
// their past bookings keep their name.
export async function deleteStaffAction(staffId: string): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };

  const { count } = await s.supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", s.tenantId)
    .eq("staff_id", staffId);
  if (count) return { error: "They have bookings, so they can't be deleted. Untick Active instead." };

  const { data: person } = await s.supabase.from("staff").select("avatar_url").eq("id", staffId).eq("tenant_id", s.tenantId).maybeSingle();
  const { error } = await s.supabase.from("staff").delete().eq("id", staffId).eq("tenant_id", s.tenantId);
  if (error) return failed("delete them", error);
  await removeStoredPhoto(person?.avatar_url ?? null, s.tenantId);
  revalidate();
  return { error: null };
}

// Ticks or unticks a service for someone. Only for services limited to
// chosen staff; a service anyone can do is changed on the Services page.
export async function setStaffServiceAction(staffId: string, serviceId: string, offered: boolean): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success || !uuid.safeParse(serviceId).success) return { error: "Invalid request." };

  const { data: links } = await s.supabase
    .from("staff_services")
    .select("staff_id")
    .eq("tenant_id", s.tenantId)
    .eq("service_id", serviceId);
  const others = (links ?? []).filter((l) => l.staff_id !== staffId);
  if (!links?.length) return { error: "Everyone offers that service. Choose who offers it on the Services page." };
  if (!offered && others.length === 0) {
    return { error: "Nobody else offers that service. Set it to \"Anyone\" on the Services page instead." };
  }

  const { error } = offered
    ? await s.supabase
        .from("staff_services")
        .upsert({ tenant_id: s.tenantId, staff_id: staffId, service_id: serviceId }, { onConflict: "staff_id,service_id" })
    : await s.supabase
        .from("staff_services")
        .delete()
        .eq("tenant_id", s.tenantId)
        .eq("staff_id", staffId)
        .eq("service_id", serviceId);
  if (error) return failed("update their services", error);
  revalidate(staffId);
  revalidatePath("/dashboard/services");
  return { error: null };
}

// Own hours start as a copy of the business's, ready to adjust.
export async function switchToOwnHoursAction(staffId: string): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };

  const { data: business, error: readError } = await s.supabase
    .from("availability_rules")
    .select("weekday, start_time, end_time")
    .eq("tenant_id", s.tenantId)
    .is("staff_id", null);
  if (readError) return failed("copy the opening hours", readError);
  if (!business?.length) return { error: "Set the business's opening hours on the Availability page first." };

  const { error } = await s.supabase
    .from("availability_rules")
    .insert(business.map((r) => ({ ...r, tenant_id: s.tenantId, staff_id: staffId })));
  if (error) return failed("copy the opening hours", error);
  revalidate(staffId);
  return { error: null };
}

export async function switchToBusinessHoursAction(staffId: string): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };

  const { error } = await s.supabase
    .from("availability_rules")
    .delete()
    .eq("tenant_id", s.tenantId)
    .eq("staff_id", staffId);
  if (error) return failed("switch to opening hours", error);
  revalidate(staffId);
  return { error: null };
}

const timeOffSchema = z.object({
  fromDate: z.string().regex(DATE_RE, "Pick a first day"),
  toDate: z.string().regex(DATE_RE, "Pick a last day"),
  fromTime: z.string().regex(TIME_RE).nullable(),
  toTime: z.string().regex(TIME_RE).nullable(),
  reason: z.string().trim().max(200),
});

export async function addTimeOffAction(staffId: string, formData: FormData): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };
  const fromDate = String(formData.get("from_date") ?? "");
  const parsed = timeOffSchema.safeParse({
    fromDate,
    toDate: String(formData.get("to_date") || fromDate),
    fromTime: formData.get("from_time") || null,
    toTime: formData.get("to_time") || null,
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const range = timeOffRange(parsed.data);
  if ("error" in range) return { error: range.error };

  const { error } = await s.supabase.from("time_off").insert({
    tenant_id: s.tenantId,
    staff_id: staffId,
    starts_at: range.startsAt,
    ends_at: range.endsAt,
    reason: parsed.data.reason,
  });
  if (error) return failed("add that time off", error);
  revalidate(staffId);
  return { error: null };
}

export async function deleteTimeOffAction(timeOffId: string): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(timeOffId).success) return { error: "Invalid request." };

  const { data, error } = await s.supabase
    .from("time_off")
    .delete()
    .eq("id", timeOffId)
    .eq("tenant_id", s.tenantId)
    .select("staff_id");
  if (error) return failed("remove that time off", error);
  revalidate(data?.[0]?.staff_id);
  return { error: null };
}

// Uploads a staff photo to Supabase Storage (<tenant>/<staff>-<random>) and
// points the staff member at it, removing the photo it replaces. The
// service-role client does the storage work, only after confirming through
// the user's own RLS-scoped client that this staff member is theirs.
export async function uploadStaffPhotoAction(staffId: string, formData: FormData): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is over 2 MB. Please choose a smaller one." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(bytes);
  if (!kind) return { error: "Use a JPEG, PNG or WebP photo." };

  const { data: person } = await s.supabase
    .from("staff")
    .select("id, avatar_url")
    .eq("tenant_id", s.tenantId)
    .eq("id", staffId)
    .maybeSingle();
  if (!person) return { error: "Staff member not found." };

  const admin = createAdminClient();
  const path = `${s.tenantId}/${staffId}-${crypto.randomUUID()}.${kind.ext}`;
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: kind.contentType, cacheControl: "31536000", upsert: false });
  if (uploadError) return failed("upload the photo", uploadError);

  const url = admin.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await s.supabase.from("staff").update({ avatar_url: url }).eq("id", staffId).eq("tenant_id", s.tenantId);
  if (error) {
    await admin.storage.from(PHOTO_BUCKET).remove([path]);
    return failed("save the photo", error);
  }
  await removeStoredPhoto(person.avatar_url, s.tenantId);
  revalidate(staffId);
  return { error: null };
}

export async function removeStaffPhotoAction(staffId: string): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(staffId).success) return { error: "Invalid request." };
  const { data: person } = await s.supabase
    .from("staff")
    .select("avatar_url")
    .eq("tenant_id", s.tenantId)
    .eq("id", staffId)
    .maybeSingle();
  if (!person) return { error: "Staff member not found." };
  const { error } = await s.supabase.from("staff").update({ avatar_url: null }).eq("id", staffId).eq("tenant_id", s.tenantId);
  if (error) return failed("remove the photo", error);
  await removeStoredPhoto(person.avatar_url, s.tenantId);
  revalidate(staffId);
  return { error: null };
}

// Deletes a photo we host, but only from this business's own folder.
async function removeStoredPhoto(url: string | null, tenantId: string) {
  const path = storedPhotoPath(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!path?.startsWith(`${tenantId}/`)) return;
  const { error } = await createAdminClient().storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error(`Removing old staff photo ${path} failed:`, error);
}
