import type { SupabaseClient } from "@supabase/supabase-js";

// The getting-started steps for a business, worked out from what's actually
// set up. Shown as the Overview checklist; when every step is done, the
// owner can ask for a website brief (Settings → Your website).

export type SetupStep = { title: string; text: string; href: string; done: boolean };

export async function loadSetupSteps(supabase: SupabaseClient, tenantId: string, bookings: boolean): Promise<SetupStep[]> {
  const count = { count: "exact", head: true } as const;
  const [knowledge, infoItems, hours, tenant, chats] = await Promise.all([
    // The owner's own entries; an imported website doesn't tick this off.
    supabase.from("knowledge_items").select("id", count).eq("tenant_id", tenantId).eq("source", "manual"),
    supabase.from("knowledge_items").select("id", count).eq("tenant_id", tenantId).eq("type", "info"),
    supabase.from("availability_rules").select("id", count).eq("tenant_id", tenantId),
    supabase.from("tenants").select("allowed_domains, status").eq("id", tenantId).maybeSingle(),
    supabase.from("conversations").select("id", count).eq("tenant_id", tenantId).eq("channel", "web"),
  ]);
  const pending = tenant.data?.status === "pending";

  const steps = [
    {
      title: "Add your knowledge",
      text: "Services, prices, policies and FAQs: everything the AI answers from.",
      href: "/dashboard/knowledge",
      done: (knowledge.count ?? 0) > 0,
    },
    bookings
      ? {
          title: "Set your hours",
          text: "Your opening hours decide which times customers can book.",
          href: "/dashboard/availability",
          done: (hours.count ?? 0) > 0,
        }
      : {
          title: "Add your hours",
          text: "Add an Info item with your hours, so the AI can tell customers when you're open.",
          href: "/dashboard/knowledge",
          done: (infoItems.count ?? 0) > 0,
        },
    {
      title: "Install the widget",
      text: "Add your website under Allowed domains, then paste the snippet from Widgets into your site.",
      href: "/dashboard/settings",
      done: (tenant.data?.allowed_domains?.length ?? 0) > 0,
    },
    {
      title: "Test a chat",
      text: pending
        ? "Once your business is approved, ask your website's chat a few real questions."
        : "Ask your website's chat a few real questions and check the answers in Conversations.",
      href: "/dashboard/conversations",
      done: (chats.count ?? 0) > 0,
    },
  ];

  return steps;
}

export async function setupComplete(supabase: SupabaseClient, tenantId: string, bookings: boolean): Promise<boolean> {
  return (await loadSetupSteps(supabase, tenantId, bookings)).every((s) => s.done);
}
