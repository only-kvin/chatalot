import type { SupabaseClient } from "@supabase/supabase-js";

export async function createTenant(
  admin: SupabaseClient,
  params: { name: string; slug: string; ownerUserId?: string },
) {
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: params.name, slug: params.slug })
    .select()
    .single();
  if (tenantError) throw new Error(`Failed to create tenant: ${tenantError.message}`);

  const { error: agentConfigError } = await admin
    .from("agent_configs")
    .insert({ tenant_id: tenant.id, business_name: params.name });
  if (agentConfigError) {
    throw new Error(`Failed to create agent_configs: ${agentConfigError.message}`);
  }

  const { error: widgetSettingsError } = await admin
    .from("widget_settings")
    .insert({ tenant_id: tenant.id });
  if (widgetSettingsError) {
    throw new Error(`Failed to create widget_settings: ${widgetSettingsError.message}`);
  }

  if (params.ownerUserId) {
    const { error: memberError } = await admin
      .from("tenant_members")
      .insert({ tenant_id: tenant.id, user_id: params.ownerUserId, role: "owner" });
    if (memberError) {
      throw new Error(`Failed to add tenant member: ${memberError.message}`);
    }
  }

  return tenant;
}
