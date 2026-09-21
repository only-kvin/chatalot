// Idempotent seed: creates (or reuses) a "Demo Salon" tenant with sample knowledge.
// Does NOT populate knowledge_chunks — chunking/embedding needs Voyage AI, which
// isn't wired up until Phase 1.
// Usage: pnpm seed-demo-salon

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";

const SLUG = "demo-salon";

const SAMPLE_KNOWLEDGE = [
  {
    type: "info",
    title: "Hours",
    content:
      "We're open Tuesday to Saturday, 9am to 6pm. Closed Sundays and Mondays.",
  },
  {
    type: "info",
    title: "Location",
    content: "12 Main Road, Sea Point, Cape Town. Street parking available.",
  },
  {
    type: "info",
    title: "Contact",
    content: "Call or WhatsApp us on 021 555 0134.",
  },
  {
    type: "service",
    title: "Haircuts",
    content: "Women's cut and blow-dry: R450. Men's cut: R250. Takes about 45 minutes.",
  },
  {
    type: "service",
    title: "Colour",
    content:
      "Full colour from R850, balayage from R1200, depending on hair length. Consultation recommended for first-time colour clients.",
  },
  {
    type: "faq",
    title: "Do you take walk-ins?",
    content:
      "We prefer bookings so we can guarantee your stylist and time slot, but we'll always try to fit walk-ins in where we can.",
  },
  {
    type: "policy",
    title: "Cancellations",
    content:
      "Please give us at least 4 hours' notice to cancel or reschedule, otherwise a 50% cancellation fee may apply.",
  },
] as const;

async function main() {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", SLUG)
    .maybeSingle();

  const tenant =
    existing ??
    (await createTenant(admin, { name: "Demo Salon", slug: SLUG }));

  console.log(`Tenant ready: ${tenant.id} (${SLUG})`);

  await admin
    .from("agent_configs")
    .update({
      business_name: "Demo Salon",
      tone: "friendly and casual",
      greeting: "Hi! Welcome to Demo Salon — how can I help you today?",
      handoff_contact: "021 555 0134",
    })
    .eq("tenant_id", tenant.id);

  // Wipe and reseed knowledge_items so re-running this script stays idempotent.
  await admin.from("knowledge_items").delete().eq("tenant_id", tenant.id);

  const { error } = await admin.from("knowledge_items").insert(
    SAMPLE_KNOWLEDGE.map((item) => ({ ...item, tenant_id: tenant.id })),
  );
  if (error) {
    console.error("Failed to seed knowledge_items:", error.message);
    process.exit(1);
  }

  console.log(`Seeded ${SAMPLE_KNOWLEDGE.length} knowledge items.`);
}

main();
