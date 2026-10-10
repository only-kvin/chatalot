"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { featureError } from "@/lib/dashboard-features";

// Services and who offers them. Uses the signed-in user's client, so RLS
// keeps everything inside their business. Results are returned, not thrown
// (Next.js hides thrown messages in production).

type Result = { error: string | null };

const uuid = z.string().uuid();
const minutes = (label: string) => z.coerce.number().int().min(0, `${label} can't be negative`).max(240, `${label} is at most 240 minutes`);

const rand = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), message);
const cents = (v: string) => (v ? Math.round(Number(v) * 100) : null);

const serviceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(1000),
  category: z.string().trim().max(60),
  duration_minutes: z.coerce.number().int().min(5, "At least 5 minutes").max(1440),
  buffer_before_min: minutes("Time before"),
  buffer_after_min: minutes("Time after"),
  price_rand: rand("Enter a price like 250 or 250.00"),
  location: z.enum(["business", "customer", "either"]),
  price_type: z.enum(["fixed", "from", "on_inspection"]),
  callout_fee_rand: rand("Enter a call-out fee like 450"),
  // "" = an exact start time.
  arrival_window_minutes: z
    .string()
    .refine((v) => v === "" || ["60", "120", "180", "240", "480"].includes(v), "Pick an arrival window"),
  active: z.boolean(),
  online_bookable: z.boolean(),
  // "anyone" = every active staff member; otherwise only those ticked.
  staff_mode: z.enum(["anyone", "chosen"]),
  staff_ids: z.array(uuid),
});

function parseForm(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "",
    duration_minutes: formData.get("duration_minutes"),
    buffer_before_min: formData.get("buffer_before_min") || 0,
    buffer_after_min: formData.get("buffer_after_min") || 0,
    price_rand: formData.get("price_rand") ?? "",
    location: formData.get("location") ?? "business",
    price_type: formData.get("price_type") ?? "fixed",
    callout_fee_rand: formData.get("callout_fee_rand") ?? "",
    arrival_window_minutes: formData.get("arrival_window_minutes") ?? "",
    active: formData.get("active") === "on",
    online_bookable: formData.get("online_bookable") === "on",
    staff_mode: formData.get("staff_mode") ?? "anyone",
    staff_ids: formData.getAll("staff_ids"),
  });
}

function toRecord(d: z.infer<typeof serviceSchema>) {
  return {
    name: d.name,
    description: d.description,
    category: d.category,
    duration_minutes: d.duration_minutes,
    buffer_before_min: d.buffer_before_min,
    buffer_after_min: d.buffer_after_min,
    // Quoted on site: no price is stored, so none can be shown.
    price_cents: d.price_type === "on_inspection" ? null : cents(d.price_rand),
    location: d.location,
    price_type: d.price_type,
    // Fee and window only apply at the customer's address.
    callout_fee_cents: d.location === "business" ? null : cents(d.callout_fee_rand),
    arrival_window_minutes: d.location === "business" || !d.arrival_window_minutes ? null : Number(d.arrival_window_minutes),
    active: d.active,
    online_bookable: d.online_bookable,
  };
}

async function session() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return null;
  return { tenantId, supabase: await createClient() };
}
type Session = NonNullable<Awaited<ReturnType<typeof session>>>;

function failed(what: string, err: unknown): Result {
  console.error(`Services: ${what} failed:`, err);
  return { error: `Couldn't ${what}. Please try again.` };
}

function revalidate() {
  revalidatePath("/dashboard/services");
  revalidatePath("/dashboard/staff", "layout");
}

// Replaces who offers the service. No links at all means anyone can do it.
async function setStaff(s: Session, serviceId: string, d: z.infer<typeof serviceSchema>): Promise<Result> {
  if (d.staff_mode === "chosen" && d.staff_ids.length === 0) {
    return { error: "Tick at least one person, or choose \"Anyone\"." };
  }
  const { error: clearError } = await s.supabase
    .from("staff_services")
    .delete()
    .eq("tenant_id", s.tenantId)
    .eq("service_id", serviceId);
  if (clearError) return failed("update who offers it", clearError);
  if (d.staff_mode === "anyone") return { error: null };

  // Staff from another business fail the (tenant_id, staff_id) foreign key.
  const { error } = await s.supabase
    .from("staff_services")
    .insert(d.staff_ids.map((staffId) => ({ tenant_id: s.tenantId, staff_id: staffId, service_id: serviceId })));
  if (error) return failed("update who offers it", error);
  return { error: null };
}

export async function createServiceAction(formData: FormData): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { data: last } = await s.supabase
    .from("services")
    .select("sort_order")
    .eq("tenant_id", s.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await s.supabase
    .from("services")
    .insert({ tenant_id: s.tenantId, ...toRecord(parsed.data), sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return failed("add the service", error);

  const staffResult = await setStaff(s, data.id, parsed.data);
  revalidate();
  return staffResult;
}

export async function updateServiceAction(serviceId: string, formData: FormData): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(serviceId).success) return { error: "Invalid request." };
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { error } = await s.supabase
    .from("services")
    .update(toRecord(parsed.data))
    .eq("id", serviceId)
    .eq("tenant_id", s.tenantId);
  if (error) return failed("save the service", error);

  const staffResult = await setStaff(s, serviceId, parsed.data);
  revalidate();
  return staffResult;
}

export async function deleteServiceAction(serviceId: string): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(serviceId).success) return { error: "Invalid request." };

  // Bookings keep pointing at their service, so a booked service stays.
  const { count } = await s.supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", s.tenantId)
    .eq("service_id", serviceId);
  if (count) return { error: "This service has bookings, so it can't be deleted. Untick Active to stop new bookings." };

  const { error } = await s.supabase.from("services").delete().eq("id", serviceId).eq("tenant_id", s.tenantId);
  if (error) return failed("delete the service", error);
  revalidate();
  return { error: null };
}

export async function moveServiceAction(serviceId: string, direction: "up" | "down"): Promise<Result> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const s = await session();
  if (!s) return { error: "Not authorized." };
  if (!uuid.safeParse(serviceId).success) return { error: "Invalid request." };

  const { data: services, error } = await s.supabase
    .from("services")
    .select("id")
    .eq("tenant_id", s.tenantId)
    .order("sort_order")
    .order("name");
  if (error || !services) return failed("reorder", error);
  const i = services.findIndex((svc) => svc.id === serviceId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= services.length) return { error: null };

  const order = services.map((svc) => svc.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [index, id] of order.entries()) {
    const { error: updateError } = await s.supabase
      .from("services")
      .update({ sort_order: index + 1 })
      .eq("id", id)
      .eq("tenant_id", s.tenantId);
    if (updateError) return failed("reorder", updateError);
  }
  revalidate();
  return { error: null };
}
