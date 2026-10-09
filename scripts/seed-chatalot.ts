// Idempotent seed for the platform's own tenant, "ChatAlot": the AI
// receptionist on the marketing site. It answers questions about the product
// from the knowledge below, files demo requests as leads, and books demo
// calls (a 30-minute "Demo call" service) through the appointment widget.
// Re-running replaces its knowledge, services and hours.
//
// Usage: pnpm seed-chatalot [owner-email]   then   pnpm reembed-tenant chatalot
// Then set NEXT_PUBLIC_MARKETING_WIDGET_KEY to the key this prints.
//
// owner-email becomes the tenant's owner, so its leads and alerts reach
// someone and its dashboard can be opened. Use an address that isn't
// already in another business (a sign-in sees one business for now), e.g.
// a Gmail "+chatalot" alias of your own address.

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { BRAND_DOMAIN, BRAND_NAME } from "../lib/brand";
import { LEGAL } from "../lib/legal";

const SLUG = "chatalot";

// Only what the product does today. Keep in step with lib/marketing/nav.ts.
const KNOWLEDGE = [
  {
    type: "info",
    title: "What ChatAlot is",
    content: `${BRAND_NAME} is an AI receptionist for small service businesses such as salons, spas, gyms, clinics and tradespeople. It answers customers on the business's website (a chat widget) and on WhatsApp, day and night, using the business's own information. It captures leads, books appointments and sends reminders.`,
  },
  {
    type: "info",
    title: "Contact",
    content: `Email ${LEGAL.contactEmail}, or ask for a demo on the website at ${BRAND_DOMAIN}/demo. Demo calls are 30 minutes and can be booked here in the chat.`,
  },
  {
    type: "info",
    title: "Hours",
    content: "The team is available for demo calls Monday to Friday, 09:00 to 17:00 (South African time). The AI receptionist on this website answers at any time.",
  },
  {
    type: "service",
    title: "Website chat",
    content: "A chat widget for the business's website, added with one line of code, in the business's colours. The AI answers only from the business's own knowledge base: services, prices, hours and policies. It never invents prices, availability or policies.",
  },
  {
    type: "service",
    title: "WhatsApp",
    content: "The same AI receptionist can answer on the business's WhatsApp Business number, connected through Meta's official WhatsApp Cloud API. The owner can take over any conversation, and customers can ask for a person at any time.",
  },
  {
    type: "service",
    title: "Bookings",
    content: "Online booking with staff, services, opening hours and time off. Customers book through the appointment or schedule widget, the hosted booking page, or a booking link the AI sends. Reminders go out before appointments, and customers can reschedule by link. Bookings are optional: trades and callout businesses can leave them switched off and capture jobs as leads instead.",
  },
  {
    type: "service",
    title: "Leads and customers",
    content: "Every enquiry the AI captures becomes a lead in the dashboard, with an email alert to the owner. Leads can be exported as CSV. Customer records keep a history of what each customer agreed to, for POPIA.",
  },
  {
    type: "service",
    title: "Reviews and daily summary",
    content: "After an attended appointment, customers are asked for a review; low scores alert the owner first. Owners can get a daily summary email of the day's conversations, leads and bookings.",
  },
  {
    type: "service",
    title: "Website widgets",
    content: "Besides the chat: schedule, appointment, contact form and registration widgets, all styled in the business's colours and installed with the same one line of code.",
  },
  {
    type: "policy",
    title: "Pricing",
    content: "There are three plans: Starter (website chat and contact form), Growth (adds WhatsApp and bookings) and Pro (adds review requests and the registration widget). Every plan includes leads, the knowledge base, conversations and customer records. Prices are shared on a demo call; do not quote amounts.",
  },
  {
    type: "policy",
    title: "Privacy and POPIA",
    content: `The AI asks before saving anyone's contact details. The business is the responsible party for its customers' information and ${BRAND_NAME} is its operator. Customers can ask for their data to be deleted. The privacy policy is at ${BRAND_DOMAIN}/privacy.`,
  },
  {
    type: "faq",
    title: "How long does setup take?",
    content: "Usually an afternoon: add your business information, paste one line of code into your website, and optionally connect WhatsApp. The team helps you set it up.",
  },
  {
    type: "faq",
    title: "Not built yet",
    content: "Not available today: taking payments, marketing campaigns, a branded mobile app, website building and multi-location management. If asked, say these aren't available and offer a demo call to discuss needs.",
  },
] as const;

const DEMO_CALL = {
  name: "Demo call",
  description: "A 30-minute call to see ChatAlot working for your business.",
  duration_minutes: 30,
  price_cents: null,
};

// Monday to Friday, 09:00 to 17:00. weekday: 0 = Sunday ... 6 = Saturday.
const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "09:00", end_time: "17:00" }));

async function main() {
  const admin = createAdminClient();

  const { data: existing } = await admin.from("tenants").select("id").eq("slug", SLUG).maybeSingle();
  const tenant = existing ?? (await createTenant(admin, { name: BRAND_NAME, slug: SLUG }));

  // Pro, so every feature (bookings for demo calls included) is on.
  const { data: row, error: tenantError } = await admin
    .from("tenants")
    .update({ plan: "pro", status: "active", allowed_domains: [BRAND_DOMAIN] })
    .eq("id", tenant.id)
    .select("public_widget_key")
    .single();
  if (tenantError) throw new Error(`Updating the tenant failed: ${tenantError.message}`);

  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what} failed: ${error.message}`);
  };

  fail(
    "Updating agent_configs",
    (
      await admin
        .from("agent_configs")
        .update({
          business_name: BRAND_NAME,
          tone: "friendly, clear and concise",
          greeting: `Hi! I'm ${BRAND_NAME}'s AI receptionist, the same one your customers would chat to. Ask me anything about ${BRAND_NAME}, or book a demo call.`,
          system_prompt_extra:
            "You are answering business owners who are considering ChatAlot for their own business. When someone is interested, offer a 30-minute demo call and send the booking link. Never quote prices.",
          handoff_contact: LEGAL.contactEmail,
        })
        .eq("tenant_id", tenant.id)
    ).error,
  );

  fail(
    "Updating widget_settings",
    (
      await admin
        .from("widget_settings")
        .update({
          primary_color: "#4f46e5",
          launcher_text: "Ask us anything",
          teaser_text: `Questions about ${BRAND_NAME}? Ask our AI receptionist.`,
          quick_replies: ["How does it work?", "Does it work on WhatsApp?", "Book a demo call"],
        })
        .eq("tenant_id", tenant.id)
    ).error,
  );

  fail("Clearing knowledge_items", (await admin.from("knowledge_items").delete().eq("tenant_id", tenant.id)).error);
  fail(
    "Seeding knowledge_items",
    (await admin.from("knowledge_items").insert(KNOWLEDGE.map((item) => ({ ...item, tenant_id: tenant.id })))).error,
  );

  // Updated in place rather than replaced: demo bookings point at it.
  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("name", DEMO_CALL.name)
    .maybeSingle();
  fail(
    "Saving the demo call service",
    service
      ? (await admin.from("services").update(DEMO_CALL).eq("id", service.id).eq("tenant_id", tenant.id)).error
      : (await admin.from("services").insert({ ...DEMO_CALL, tenant_id: tenant.id })).error,
  );

  fail("Clearing availability_rules", (await admin.from("availability_rules").delete().eq("tenant_id", tenant.id)).error);
  fail(
    "Seeding availability_rules",
    (await admin.from("availability_rules").insert(HOURS.map((h) => ({ ...h, tenant_id: tenant.id })))).error,
  );

  const ownerEmail = process.argv[2]?.trim().toLowerCase();
  if (ownerEmail) await addOwner(admin, tenant.id, ownerEmail);

  console.log(`Tenant ready: ${tenant.id} (${SLUG})`);
  console.log(`Seeded ${KNOWLEDGE.length} knowledge items, the demo call service and weekday hours.`);
  console.log(`Next: pnpm reembed-tenant ${SLUG}`);
  console.log(`Then set NEXT_PUBLIC_MARKETING_WIDGET_KEY=${row.public_widget_key}`);
}

// Makes the account with this email (creating it if needed; it signs in by
// magic link) an owner of the tenant.
async function addOwner(admin: ReturnType<typeof createAdminClient>, tenantId: string, email: string) {
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing users failed: ${error.message}`);
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 1000) break;
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw new Error(`Creating ${email} failed: ${error.message}`);
    userId = data.user.id;
  }

  const { data: other } = await admin.from("tenant_members").select("tenant_id").eq("user_id", userId).neq("tenant_id", tenantId);
  if (other?.length) {
    throw new Error(`${email} already belongs to another business. Use a separate address (e.g. a +chatalot alias).`);
  }
  const { error } = await admin
    .from("tenant_members")
    .upsert({ tenant_id: tenantId, user_id: userId, role: "owner" }, { onConflict: "tenant_id,user_id" });
  if (error) throw new Error(`Adding the owner failed: ${error.message}`);
  console.log(`Owner: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
