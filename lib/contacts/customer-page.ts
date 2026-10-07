import { createAdminClient } from "@/lib/db/supabase-admin";
import { ACTIVE_STATUSES } from "@/lib/bookings/manage";
import { manageBookingUrl } from "@/lib/email/customer-booking";
import { readCustomerToken } from "@/lib/security/signed-token";
import { loadWidget } from "@/lib/widgets/config";
import { currentConsents, type ConsentKind } from "./consents";

// A customer's own page (/c/<token>). The signed token names the business
// and an email address; the page shows only bookings made with that exact
// address, and the consents of customer records with that address. A phone
// number alone never unlocks anything here.

const DAY_MS = 86_400_000;

// `ilike` without wildcards: an address containing "_" or "%" must only
// match itself.
const exactly = (email: string) => email.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function loadCustomerPage(token: string) {
  const who = readCustomerToken(decodeURIComponent(token));
  if (!who) return null;
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, status").eq("id", who.tenantId).maybeSingle();
  if (!tenant || tenant.status !== "active") return null;

  const since = new Date(Date.now() - 90 * DAY_MS).toISOString();
  const [{ data: config }, { data: bookings }, { data: contacts }, registration] = await Promise.all([
    admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", who.tenantId).maybeSingle(),
    admin
      .from("bookings")
      .select("id, starts_at, ends_at, status, services(name), staff(name)")
      .eq("tenant_id", who.tenantId)
      .ilike("email", exactly(who.email))
      .gte("starts_at", since)
      .order("starts_at"),
    admin.from("contacts").select("id, name").eq("tenant_id", who.tenantId).eq("email", who.email),
    loadWidget(admin, who.tenantId, "registration"),
  ]);

  // Their choices, from the first matching record (they normally have one).
  const contact = contacts?.[0] ?? null;
  const consents = contact ? await currentConsents(admin, who.tenantId, contact.id) : {};
  const now = Date.now();
  const rows = (bookings ?? []).map((b) => {
    const upcoming = new Date(b.starts_at).getTime() > now;
    return {
      id: b.id,
      startsAt: b.starts_at,
      status: b.status,
      serviceName: (b.services as unknown as { name: string } | null)?.name ?? "Appointment",
      staffName: (b.staff as unknown as { name: string } | null)?.name ?? null,
      upcoming,
      manageUrl: upcoming && ACTIVE_STATUSES.includes(b.status) ? manageBookingUrl(b.id, b.ends_at) : null,
    };
  });

  return {
    tenantId: who.tenantId,
    email: who.email,
    name: contact?.name ?? null,
    businessName: config?.business_name || "the business",
    contact: config?.handoff_contact ?? "",
    bookingUrl: registration.copy.bookingUrl || null,
    bookLinkLabel: registration.copy.bookLinkLabel,
    hasRecord: Boolean(contacts?.length),
    upcoming: rows.filter((r) => r.upcoming),
    past: rows.filter((r) => !r.upcoming).reverse(),
    consents: {
      newsletter: consents.newsletter?.granted ?? false,
      marketing: consents.marketing?.granted ?? false,
    } satisfies Partial<Record<ConsentKind, boolean>>,
  };
}
