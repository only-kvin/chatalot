"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";

// Both actions use the signed-in user's client, so RLS confines them to the
// user's own tenant on top of the explicit tenant filter. Errors are returned,
// not thrown — Next.js hides thrown messages in production.

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "That email address doesn't look right."),
  notes: z.string().trim().max(2000),
});

export async function updateCustomerAction(formData: FormData): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { id, name, email, notes } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      name: name || null,
      // The owner's edit outranks names from WhatsApp or the customer.
      name_source: name ? "owner" : null,
      email: email || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`Updating customer ${id} failed:`, error);
    return {
      error:
        error.code === "23505"
          ? "Another customer already has that email address."
          : "Couldn't save the customer. Please try again.",
    };
  }

  revalidatePath(`/dashboard/customers/${id}`);
  revalidatePath("/dashboard/customers");
  return { error: null };
}

// Removes the customer with all their conversations, messages, leads,
// bookings and alerts (POPIA deletion requests). One database function, so
// it's all-or-nothing.
export async function deleteCustomerAction(id: string): Promise<{ error: string | null }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid customer." };

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!contact) return { error: "Customer not found." };

  const { error } = await supabase.rpc("delete_contact_with_history", { p_contact_id: id });
  if (error) {
    console.error(`Deleting customer ${id} failed:`, error);
    return { error: "Couldn't delete the customer. Nothing was removed; please try again." };
  }

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/conversations");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/bookings");
  return { error: null };
}
