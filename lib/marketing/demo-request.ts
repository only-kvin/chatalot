import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertContact } from "@/lib/contacts/upsert";
import { sendPlatformAdminEmail } from "@/lib/email/send";
import { recordNotification } from "@/lib/notifications";
import { BUSINESS_TYPE_OPTIONS } from "./business-types";

// A "Get a demo" request from the marketing site. It's filed as a lead in
// the platform's own tenant (the one whose widget key runs the site chat),
// exactly like a lead the site's AI captures, and the platform admins are
// emailed.

const typeValues = BUSINESS_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]];

export const demoRequestSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(100),
  business: z.string().trim().min(1, "Please enter your business name.").max(120),
  businessType: z.enum(typeValues, { error: "Please choose your type of business." }),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a phone number we can reach you on.")
    .max(30)
    .regex(/^[+\d][\d\s()-]*$/, "Please enter a valid phone number."),
  email: z.email("Please enter a valid email address.").max(200),
  message: z.string().trim().max(1000).optional().default(""),
  consent: z.literal("on", { error: "Please agree so we can contact you." }),
});
export type DemoRequest = z.infer<typeof demoRequestSchema>;

export async function fileDemoRequest(admin: SupabaseClient, req: DemoRequest, widgetKey: string | null): Promise<void> {
  const typeLabel = BUSINESS_TYPE_OPTIONS.find((o) => o.value === req.businessType)?.label ?? "Other";
  const summary = [`${req.business} (${typeLabel}).`, req.message].filter(Boolean).join(" ").slice(0, 500);

  const { data: tenant } = widgetKey
    ? await admin.from("tenants").select("id").eq("public_widget_key", widgetKey).maybeSingle()
    : { data: null };

  if (tenant) {
    // They ticked the consent box, so a customer record is kept.
    const contactId = await upsertContact(admin, {
      tenantId: tenant.id,
      name: req.name,
      phone: req.phone,
      email: req.email,
      nameSource: "customer",
      channel: "web",
      consent: true,
    }).catch((err) => {
      console.error("Saving the demo requester failed:", err);
      return null;
    });
    const { error } = await admin.from("leads").insert({
      tenant_id: tenant.id,
      contact_id: contactId,
      name: req.name,
      phone: req.phone,
      email: req.email,
      interest: "Demo request",
      summary,
      source: "demo_form",
    });
    if (error) console.error("Saving the demo request lead failed:", error);
    await recordNotification(admin, {
      tenantId: tenant.id,
      type: "new_lead",
      title: `Demo request: ${req.name}`,
      body: `${req.business} · ${req.phone}`,
    });
  } else {
    console.error("Demo request not filed as a lead: NEXT_PUBLIC_MARKETING_WIDGET_KEY doesn't match a tenant.");
  }

  // The email always goes, so a request is never lost even without the tenant.
  await sendPlatformAdminEmail(admin, {
    subject: `Demo request: ${req.business}`,
    intro: "Someone asked for a demo on the website.",
    details: [
      ["Name", req.name],
      ["Business", req.business],
      ["Type", typeLabel],
      ["Phone", req.phone],
      ["Email", req.email],
      ["Message", req.message || null],
    ],
    path: "/dashboard/leads",
  });
}
