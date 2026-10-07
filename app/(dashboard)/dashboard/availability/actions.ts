"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { checkNewWindow } from "@/lib/bookings/hours";

// Opening hours, one-off exceptions and booking rules. Weekly hours belong
// to the business (staff_id null) or to one staff member. Results are
// returned rather than thrown: Next.js hides thrown messages in production.

type Result = { error: string | null };

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ruleSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(TIME_RE, "Invalid start time"),
  end_time: z.string().regex(TIME_RE, "Invalid end time"),
  staff_id: z.string().uuid().nullable(),
});

const exceptionSchema = z
  .object({
    date: z.string().regex(DATE_RE, "Invalid date"),
    is_closed: z.boolean(),
    start_time: z.string(),
    end_time: z.string(),
  })
  .refine((d) => d.is_closed || (TIME_RE.test(d.start_time) && TIME_RE.test(d.end_time) && d.start_time < d.end_time), {
    message: "Give a start time before the end time, or mark the date as closed",
  });

const LEAD_OPTIONS = [0, 30, 60, 120, 240, 1440, 2880];
const rulesSchema = z.object({
  booking_lead_time_minutes: z.coerce.number().int().refine((v) => LEAD_OPTIONS.includes(v), "Pick a notice period"),
  booking_horizon_days: z.coerce.number().int().min(1).max(365),
  slot_minutes: z.coerce.number().int().refine((v) => [15, 30, 60].includes(v), "Pick 15, 30 or 60 minutes"),
  booking_change_cutoff_minutes: z.coerce.number().int().min(0).max(10080),
  bookings_need_approval: z.boolean(),
});

const uuid = z.string().uuid();

function revalidate(staffId: string | null) {
  revalidatePath("/dashboard/availability");
  if (staffId) revalidatePath(`/dashboard/staff/${staffId}`);
}

export async function createAvailabilityRuleAction(formData: FormData): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const parsed = ruleSchema.safeParse({
    weekday: formData.get("weekday"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    staff_id: formData.get("staff_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { staff_id: staffId, ...window } = parsed.data;

  const supabase = await createClient();
  let existing = supabase
    .from("availability_rules")
    .select("weekday, start_time, end_time")
    .eq("tenant_id", tenantId)
    .eq("weekday", window.weekday);
  existing = staffId ? existing.eq("staff_id", staffId) : existing.is("staff_id", null);
  const { data: sameDay } = await existing;
  const problem = checkNewWindow(sameDay ?? [], window);
  if (problem) return { error: problem };

  // A staff id from another business fails the (tenant_id, staff_id)
  // foreign key, on top of RLS.
  const { error } = await supabase.from("availability_rules").insert({ tenant_id: tenantId, staff_id: staffId, ...window });
  if (error) {
    console.error(`Adding hours for ${tenantId} failed:`, error);
    return { error: "Couldn't add those hours. Please try again." };
  }
  revalidate(staffId);
  return { error: null };
}

export async function deleteAvailabilityRuleAction(id: string): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!uuid.safeParse(id).success) return { error: "Invalid request." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("staff_id");
  if (error) {
    console.error(`Deleting hours ${id} failed:`, error);
    return { error: "Couldn't remove those hours. Please try again." };
  }
  revalidate(data?.[0]?.staff_id ?? null);
  return { error: null };
}

export async function createAvailabilityExceptionAction(formData: FormData): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const parsed = exceptionSchema.safeParse({
    date: formData.get("date"),
    is_closed: formData.get("is_closed") === "on",
    start_time: formData.get("start_time") ?? "",
    end_time: formData.get("end_time") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const isClosed = parsed.data.is_closed;
  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").upsert(
    {
      tenant_id: tenantId,
      date: parsed.data.date,
      is_closed: isClosed,
      start_time: isClosed ? null : parsed.data.start_time,
      end_time: isClosed ? null : parsed.data.end_time,
    },
    { onConflict: "tenant_id,date" },
  );
  if (error) {
    console.error(`Adding an exception for ${tenantId} failed:`, error);
    return { error: "Couldn't save that date. Please try again." };
  }
  revalidate(null);
  return { error: null };
}

export async function deleteAvailabilityExceptionAction(id: string): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!uuid.safeParse(id).success) return { error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) {
    console.error(`Deleting exception ${id} failed:`, error);
    return { error: "Couldn't remove that date. Please try again." };
  }
  revalidate(null);
  return { error: null };
}

export async function updateBookingRulesAction(formData: FormData): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const parsed = rulesSchema.safeParse({
    booking_lead_time_minutes: formData.get("booking_lead_time_minutes"),
    booking_horizon_days: formData.get("booking_horizon_days"),
    slot_minutes: formData.get("slot_minutes"),
    booking_change_cutoff_minutes: formData.get("booking_change_cutoff_minutes"),
    // An unticked checkbox isn't submitted at all.
    bookings_need_approval: formData.get("bookings_need_approval") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_configs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Saving booking rules for ${tenantId} failed:`, error);
    return { error: "Couldn't save your booking rules. Please try again." };
  }
  revalidate(null);
  return { error: null };
}
