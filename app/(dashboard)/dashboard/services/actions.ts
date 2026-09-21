"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

const serviceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  duration_minutes: z.coerce
    .number()
    .int()
    .positive("Duration must be a positive number of minutes"),
  price_rand: z.string(),
  active: z.enum(["true", "false"]),
});

async function requireTenantId(): Promise<string> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Not authorized");
  return tenantId;
}

function toRecord(parsed: z.infer<typeof serviceSchema>) {
  const priceRand = parsed.price_rand.trim();
  return {
    name: parsed.name,
    description: parsed.description,
    duration_minutes: parsed.duration_minutes,
    price_cents: priceRand ? Math.round(Number(priceRand) * 100) : null,
    active: parsed.active === "true",
  };
}

function parseForm(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    duration_minutes: formData.get("duration_minutes"),
    price_rand: formData.get("price_rand") ?? "",
    active: formData.get("active") === "on" ? "true" : "false",
  });
}

export async function createServiceAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const parsed = parseForm(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .insert({ tenant_id: tenantId, ...toRecord(parsed.data) });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/services");
}

export async function updateServiceAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const id = formData.get("id") as string;
  const parsed = parseForm(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update(toRecord(parsed.data))
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/services");
}

export async function deleteServiceAction(formData: FormData) {
  const tenantId = await requireTenantId();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/services");
}
