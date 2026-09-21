import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantOwnerEmails } from "@/lib/db/tenant-owners";

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's default sender, works with no domain verification — but can only
// deliver to the Resend account's own verified email until a real sending
// domain is set up (see docs/SETUP.md). Swap once the platform has a domain.
const FROM = "ChatAlot <onboarding@resend.dev>";

export async function notifyOwnerOfLead(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  lead: { name: string; phone: string; email: string | null; interest: string; summary: string },
): Promise<void> {
  const ownerEmails = await getTenantOwnerEmails(admin, tenantId);
  if (ownerEmails.length === 0) return;

  try {
    await resend.emails.send({
      from: FROM,
      to: ownerEmails,
      subject: `New lead: ${lead.name} (${businessName})`,
      html: `
        <p>Your AI receptionist just captured a new lead.</p>
        <p>
          <strong>Name:</strong> ${lead.name}<br />
          <strong>Phone:</strong> ${lead.phone}<br />
          ${lead.email ? `<strong>Email:</strong> ${lead.email}<br />` : ""}
          <strong>Interest:</strong> ${lead.interest}
        </p>
        <p><strong>Summary:</strong> ${lead.summary}</p>
      `,
    });
  } catch {
    // A failed notification shouldn't break lead capture — the lead is already
    // saved and visible in the dashboard regardless.
  }
}
