"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/auth";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createClient } from "@/lib/db/supabase-server";
import { featureError } from "@/lib/dashboard-features";
import { syncClassSeries } from "@/lib/classes/sync";

// Dashboard → Classes. A class is a weekly timetable; saving it brings its
// sessions (the next eight weeks) in line. The signed-in user's client
// (RLS) writes the class, which also proves it's theirs; the sync then runs
// with the service role, for that one class.

type Result = { error: string | null; id?: string };
const uuid = z.string().uuid();

const classSchema = z
  .object({
    title: z.string().trim().min(1, "Give the class a name").max(120),
    description: z.string().trim().max(5000),
    staff_id: z.string().refine((v) => v === "" || uuid.safeParse(v).success, "Choose an instructor"),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Choose at least one day"),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
    duration_minutes: z.coerce.number().int().min(5, "At least 5 minutes").max(600, "At most 10 hours"),
    capacity: z.string().trim().regex(/^\d{0,5}$/, "Spots: a whole number, or leave empty for no limit"),
    price: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 1), "Drop-in price: an amount like 120 (at least R1), or empty for free"),
    location: z.string().trim().max(300),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first date"),
    ends_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    active: z.boolean(),
  })
  .refine((d) => !d.ends_on || d.ends_on >= d.starts_on, { message: "The last date can't be before the first", path: ["ends_on"] });

async function session() {
  const blocked = await featureError("events");
  if (blocked) return { error: blocked } as const;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." } as const;
  return { tenantId, supabase: await createClient() } as const;
}

export async function saveClassAction(classId: string | null, formData: FormData): Promise<Result> {
  const s = await session();
  if ("error" in s) return { error: s.error ?? "Not authorized." };
  const parsed = classSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    staff_id: formData.get("staff_id") ?? "",
    weekdays: formData.getAll("weekdays"),
    start_time: formData.get("start_time") ?? "",
    duration_minutes: formData.get("duration_minutes") || 60,
    capacity: formData.get("capacity") ?? "",
    price: formData.get("price") ?? "",
    location: formData.get("location") ?? "",
    starts_on: formData.get("starts_on") ?? "",
    ends_on: formData.get("ends_on") ?? "",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the class details." };
  const d = parsed.data;
  const record = {
    title: d.title,
    description: d.description,
    staff_id: d.staff_id || null,
    weekdays: [...new Set(d.weekdays)].sort(),
    start_time: d.start_time,
    duration_minutes: d.duration_minutes,
    capacity: d.capacity ? Number(d.capacity) || null : null,
    price_cents: d.price ? Math.round(Number(d.price) * 100) : null,
    location: d.location,
    starts_on: d.starts_on,
    ends_on: d.ends_on || null,
    active: d.active,
    updated_at: new Date().toISOString(),
  };

  let id = classId;
  if (classId) {
    if (!uuid.safeParse(classId).success) return { error: "Invalid class." };
    const { data, error } = await s.supabase.from("class_series").update(record).eq("tenant_id", s.tenantId).eq("id", classId).select("id");
    if (error || !data?.length) {
      console.error(`Classes: saving ${classId} failed:`, error);
      return { error: "Couldn't save the class. Please try again." };
    }
  } else {
    const user = await getSessionUser();
    const { data, error } = await s.supabase
      .from("class_series")
      .insert({ tenant_id: s.tenantId, ...record, created_by: user?.id ?? null })
      .select("id")
      .single();
    if (error) {
      console.error("Classes: creating a class failed:", error);
      return { error: error.message.includes("staff") ? "That instructor isn't on your team." : "Couldn't create the class. Please try again." };
    }
    id = data.id;
  }
  try {
    await syncClassSeries(createAdminClient(), id!);
  } catch (err) {
    console.error(`Classes: syncing ${id} after saving failed:`, err);
    return { error: "Saved, but the sessions couldn't be updated. Save again in a moment.", id: id! };
  }
  revalidatePath("/dashboard/classes");
  revalidatePath(`/dashboard/classes/${id}`);
  return { error: null, id: id! };
}
