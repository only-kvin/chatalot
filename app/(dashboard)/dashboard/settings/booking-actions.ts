"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { featureError } from "@/lib/dashboard-features";
import { canonicalPhone } from "@/lib/contacts/phone";

// Settings → Bookings: where the business goes, how call-outs are handled,
// the cancellation policy and emergencies. Uses the signed-in user's client,
// so RLS keeps it to their business. Errors are returned, not thrown.

const schema = z.object({
  business_address: z.string().trim().max(300),
  // One area per chip; the form sends them newline-separated.
  service_areas: z
    .string()
    .transform((v) => [...new Set(v.split(/\n/).map((a) => a.trim().replace(/\s+/g, " ")).filter(Boolean))])
    .refine((a) => a.length <= 100, "At most 100 areas")
    .refine((a) => a.every((x) => x.length <= 80), "Each area is at most 80 characters"),
  travel_buffer_minutes: z.coerce.number().int().min(0, "Travel time can't be negative").max(240, "Travel time is at most 240 minutes"),
  cancellation_policy: z.string().trim().max(1000),
  callouts_confirm_instantly: z.boolean(),
  emergency_callouts: z.boolean(),
  emergency_note: z.string().trim().max(500),
  owner_alert_phone: z
    .string()
    .trim()
    .refine((v) => v === "" || canonicalPhone(v) !== null, "Enter your mobile like 082 123 4567 or +27 82 123 4567"),
});

export async function updateBookingSettingsAction(formData: FormData): Promise<{ error: string | null }> {
  const blocked = await featureError("bookings");
  if (blocked) return { error: blocked };
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };

  const parsed = schema.safeParse({
    business_address: formData.get("business_address") ?? "",
    service_areas: formData.get("service_areas") ?? "",
    travel_buffer_minutes: formData.get("travel_buffer_minutes") || 0,
    cancellation_policy: formData.get("cancellation_policy") ?? "",
    callouts_confirm_instantly: formData.get("callouts_confirm_instantly") === "on",
    emergency_callouts: formData.get("emergency_callouts") === "on",
    emergency_note: formData.get("emergency_note") ?? "",
    owner_alert_phone: formData.get("owner_alert_phone") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_configs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Saving booking settings for ${tenantId} failed:`, error);
    return { error: "Couldn't save. Please try again." };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { error: null };
}
