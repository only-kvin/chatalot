import type { Metadata } from "next";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { loadWidget } from "@/lib/widgets/config";
import { parsePlan, resolveFeatures } from "@/lib/plans";
import { PublicCard, PublicShell } from "@/components/public/public-shell";

// Our hosted booking page for a business: its appointment widget,
// in its own look, for customers who'd rather click than chat (the AI's
// send_booking_link) and for businesses without a website. The widget
// reads its data from us directly, so no allowed-domain setup needed.

async function load(slug: string) {
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status, public_widget_key, plan, feature_overrides")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant || tenant.status !== "active") return null;
  // No online bookings on their plan: same as an unknown business.
  if (resolveFeatures(parsePlan(tenant.plan), tenant.feature_overrides).bookings !== "on") return null;
  const [{ data: config }, widget] = await Promise.all([
    admin.from("agent_configs").select("business_name, handoff_contact").eq("tenant_id", tenant.id).maybeSingle(),
    loadWidget(admin, tenant.id, "appointment"),
  ]);
  return {
    key: tenant.public_widget_key as string,
    businessName: config?.business_name || "Book online",
    contact: config?.handoff_contact ?? "",
    open: widget.active,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await load((await params).slug);
  return { title: page ? `Book with ${page.businessName}` : "Booking" };
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await load((await params).slug);

  return (
    <PublicShell width="lg" powered={!page?.open}>
        {!page ? (
          <PublicCard>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Page not found</h1>
            <p className="mt-1 text-muted-foreground">This booking page doesn&apos;t exist or isn&apos;t available.</p>
          </PublicCard>
        ) : (
          <>
            <header className="mb-2 text-center">
              <h1 className="font-heading text-3xl font-bold tracking-tight">{page.businessName}</h1>
              {page.contact && <p className="text-sm text-muted-foreground">{page.contact}</p>}
            </header>
            {page.open ? (
              <>
                <div data-chatalot="appointment" />
                <script src="/widget.js" data-key={page.key} data-chat="off" async />
              </>
            ) : (
              <PublicCard>
                <p>Online booking isn&apos;t open right now.{page.contact && ` Please contact ${page.businessName} on ${page.contact}.`}</p>
              </PublicCard>
            )}
          </>
        )}
    </PublicShell>
  );
}
