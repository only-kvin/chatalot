import { appUrl } from "@/lib/app-url";
import { createCustomerToken } from "@/lib/security/signed-token";
import { escapeHtml, sendCustomerEmail } from "./send";

// The link to a customer's own page (/c/<token>): their bookings with this
// business and what they've agreed to receive. Sent after registering, and
// valid for 30 days (registering again sends a fresh one).
const LINK_DAYS = 30;

export function customerPageUrl(tenantId: string, email: string, now = new Date()): string {
  return appUrl(`/c/${createCustomerToken(tenantId, email, new Date(now.getTime() + LINK_DAYS * 86_400_000))}`);
}

export function renderCustomerPageEmail(o: { name: string; businessName: string; url: string }): { subject: string; html: string } {
  return {
    subject: `Your bookings with ${o.businessName}`,
    html: `
      <p>Hi ${escapeHtml(o.name)},</p>
      <p>Thanks for signing up with ${escapeHtml(o.businessName)}. Use this link to see your bookings and choose what we may send you:</p>
      <p><a href="${escapeHtml(o.url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600">Open my page</a></p>
      <p style="font-size:12px;color:#71717a">The link works for ${LINK_DAYS} days. If you didn't sign up, you can ignore this email.</p>
    `,
  };
}

export async function emailCustomerPageLink(o: { tenantId: string; email: string; name: string; businessName: string }): Promise<void> {
  const email = renderCustomerPageEmail({ name: o.name, businessName: o.businessName, url: customerPageUrl(o.tenantId, o.email) });
  await sendCustomerEmail({ to: o.email, subject: email.subject, html: email.html });
}
