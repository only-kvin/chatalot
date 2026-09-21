"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ruleSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    start_time: z.string().regex(TIME_RE, "Invalid start time"),
    end_time: z.string().regex(TIME_RE, "Invalid end time"),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "Start time must be before end time",
    path: ["end_time"],
  });

const exceptionSchema = z
  .object({
    date: z.string().regex(DATE_RE, "Invalid date"),
    is_closed: z.enum(["true", "false"]),
    start_time: z.string(),
    end_time: z.string(),
  })
  .refine(
    (d) => d.is_closed === "true" || (TIME_RE.test(d.start_time) && TIME_RE.test(d.end_time)),
    { message: "Give both a start and end time, or mark the date as closed", path: ["start_time"] },
  );

async function requireTenantId(): Promise<string> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");
  return tenantId;
}

export async function createAvailabilityRuleAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const parsed = ruleSchema.safeParse({
    weekday: formData.get("weekday"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { error } = await supabase.from("availability_rules").insert({
    tenant_id: tenantId,
    ...parsed.data,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/availability");
}

export async function deleteAvailabilityRuleAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_rules")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/availability");
}

export async function createAvailabilityExceptionAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const parsed = exceptionSchema.safeParse({
    date: formData.get("date"),
    is_closed: formData.get("is_closed") === "on" ? "true" : "false",
    start_time: formData.get("start_time") ?? "",
    end_time: formData.get("end_time") ?? "",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const isClosed = parsed.data.is_closed === "true";
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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/availability");
}

export async function deleteAvailabilityExceptionAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_exceptions")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/availability");
}
