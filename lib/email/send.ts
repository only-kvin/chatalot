import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantOwnerEmails } from "@/lib/db/tenant-owners";
import { appUrl } from "@/lib/app-url";

// Lazy: the Resend constructor throws synchronously if the key is missing,
// and these modules are imported at Next.js build time (page-data collection)
// — constructing eagerly would crash the whole build in any environment
// missing RESEND_API_KEY, instead of just failing one send at runtime.
let resend: Resend | undefined;
function getResend(): Resend {
  return (resend ??= new Resend(process.env.RESEND_API_KEY));
}

// Resend's default sender, works with no domain verification — but can only
// deliver to the Resend account's own verified email until a real sending
// domain is set up (see docs/SETUP.md). Swap once the platform has a domain.
const FROM = "ChatAlot <onboarding@resend.dev>";

// Names, messages and reasons come from customers or the AI, so everything
// interpolated into the HTML is escaped.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type OwnerEmail = {
  subject: string;
  intro: string;
  // Label/value lines; null values are skipped.
  details: [label: string, value: string | null][];
  // Headed lists, for digests like the daily summary. Empty ones are skipped.
  sections?: { heading: string; lines: string[] }[];
  // Small print under the button.
  footer?: string;
  // Dashboard path the button opens, e.g. /dashboard/conversations/<id>.
  // A signed-out owner goes through login and lands back on it.
  path: string;
};

export function renderOwnerEmail(email: OwnerEmail): string {
  const url = appUrl(email.path);
  const details = email.details
    .filter(([, value]) => value)
    .map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value!)}`)
    .join("<br />");
  const sections = (email.sections ?? [])
    .filter((section) => section.lines.length > 0)
    .map(
      (section) =>
        `<p style="margin-bottom:4px"><strong>${escapeHtml(section.heading)}</strong></p>` +
        `<ul style="margin-top:0;padding-left:20px">${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    )
    .join("");
  return `
    <p>${escapeHtml(email.intro)}</p>
    ${details ? `<p>${details}</p>` : ""}
    ${sections}
    <p>
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600">Open in ChatAlot</a>
    </p>
    <p style="font-size:12px;color:#71717a">Or paste this link into your browser: ${escapeHtml(url)}</p>
    ${email.footer ? `<p style="font-size:12px;color:#71717a">${escapeHtml(email.footer)}</p>` : ""}
  `;
}

// Emails every owner of the tenant. Best-effort: a failed send is logged and
// never blocks the lead, booking or handoff that triggered it.
export async function sendOwnerEmail(
  admin: SupabaseClient,
  tenantId: string,
  email: OwnerEmail,
): Promise<void> {
  const to = await getTenantOwnerEmails(admin, tenantId);
  if (to.length === 0) return;
  try {
    await getResend().emails.send({ from: FROM, to, subject: email.subject, html: renderOwnerEmail(email) });
  } catch (err) {
    console.error(`Owner email "${email.subject}" failed:`, err);
  }
}

// Emails every platform admin (you, running ChatAlot). Best-effort, like
// owner emails.
export async function sendPlatformAdminEmail(admin: SupabaseClient, email: OwnerEmail): Promise<void> {
  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const to: string[] = [];
  for (const row of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(row.user_id);
    if (data?.user?.email) to.push(data.user.email);
  }
  if (to.length === 0) return;
  try {
    await getResend().emails.send({ from: FROM, to, subject: email.subject, html: renderOwnerEmail(email) });
  } catch (err) {
    console.error(`Platform admin email "${email.subject}" failed:`, err);
  }
}

export type CustomerEmail = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
};

// Emails a customer (booking confirmations and changes). Best-effort like
// owner emails. Until a sending domain is verified in Resend this only
// delivers to the Resend account's own address (see docs/SETUP.md).
export async function sendCustomerEmail(email: CustomerEmail): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "utf8"),
        contentType: a.contentType,
      })),
    });
    if (error) console.error(`Customer email "${email.subject}" failed:`, error);
  } catch (err) {
    console.error(`Customer email "${email.subject}" failed:`, err);
  }
}
