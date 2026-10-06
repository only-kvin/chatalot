import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/security/crypto";

// What the daily jobs need to message a tenant's customers on WhatsApp.
export type TenantWhatsApp = {
  phoneNumberId: string;
  accessToken: string;
  businessName: string;
  googleReviewUrl: string | null;
};

// Returns a lookup that loads each tenant's active WhatsApp number and
// settings once per run, however many bookings it has. null = the tenant has
// no WhatsApp, so nothing is sent for it.
export function tenantWhatsAppLookup(admin: SupabaseClient): (tenantId: string) => Promise<TenantWhatsApp | null> {
  const cache = new Map<string, TenantWhatsApp | null>();
  return async (tenantId) => {
    if (!cache.has(tenantId)) {
      const [{ data: channel }, { data: config }] = await Promise.all([
        admin
          .from("channels")
          .select("wa_phone_number_id, wa_access_token_encrypted")
          .eq("tenant_id", tenantId)
          .eq("type", "whatsapp")
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
        admin.from("agent_configs").select("business_name, google_review_url").eq("tenant_id", tenantId).maybeSingle(),
      ]);
      cache.set(
        tenantId,
        channel?.wa_phone_number_id && channel.wa_access_token_encrypted
          ? {
              phoneNumberId: channel.wa_phone_number_id,
              accessToken: decrypt(channel.wa_access_token_encrypted),
              businessName: config?.business_name ?? "",
              googleReviewUrl: config?.google_review_url ?? null,
            }
          : null,
      );
    }
    return cache.get(tenantId) ?? null;
  };
}
