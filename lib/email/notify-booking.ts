import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantOwnerEmails } from "@/lib/db/tenant-owners";

// Lazy: see the comment in lib/email/notify-lead.ts — avoids crashing the
// build in any environment missing RESEND_API_KEY.
let resend: Resend | undefined;
function getResend(): Resend {
  return (resend ??= new Resend(process.env.RESEND_API_KEY));
}
const FROM = "ChatAlot <onboarding@resend.dev>";

export async function notifyOwnerOfBooking(
  admin: SupabaseClient,
  tenantId: string,
  businessName: string,
  booking: {
    name: string;
    phone: string;
    email: string | null;
    serviceName: string;
    startsAtLabel: string;
  },
): Promise<void> {
  const ownerEmails = await getTenantOwnerEmails(admin, tenantId);
  if (ownerEmails.length === 0) return;

  try {
    await getResend().emails.send({
      from: FROM,
      to: ownerEmails,
      subject: `New booking: ${booking.name} (${businessName})`,
      html: `
        <p>Your AI receptionist just booked an appointment.</p>
        <p>
          <strong>Service:</strong> ${booking.serviceName}<br />
          <strong>When:</strong> ${booking.startsAtLabel}<br />
          <strong>Name:</strong> ${booking.name}<br />
          <strong>Phone:</strong> ${booking.phone}<br />
          ${booking.email ? `<strong>Email:</strong> ${booking.email}<br />` : ""}
        </p>
      `,
    });
  } catch {
    // A failed notification shouldn't undo the booking — it's already saved
    // and visible in the dashboard regardless.
  }
}
