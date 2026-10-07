import type { Metadata } from "next";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { loadWidget } from "@/lib/widgets/config";
import { parsePlan, resolveFeatures } from "@/lib/plans";

// ChatAlot's hosted booking page for a business: its appointment widget,
// in its own look, for customers who'd rather click than chat (the AI's
// send_booking_link) and for businesses without a website. The widget
// reads its data from ChatAlot itself, so no allowed-domain setup needed.

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
    <main className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        {!page ? (
          <div className="rounded-2xl border bg-white p-6 text-sm dark:bg-zinc-950">
            <h1 className="text-xl font-semibold">Page not found</h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">This booking page doesn&apos;t exist or isn&apos;t available.</p>
          </div>
        ) : (
          <>
            <header className="text-center">
              <h1 className="text-xl font-semibold">{page.businessName}</h1>
              {page.contact && <p className="text-sm text-zinc-500">{page.contact}</p>}
            </header>
            {page.open ? (
              <>
                <div data-chatalot="appointment" />
                <script src="/widget.js" data-key={page.key} data-chat="off" async />
              </>
            ) : (
              <div className="rounded-2xl border bg-white p-6 text-sm dark:bg-zinc-950">
                <p>Online booking isn&apos;t open right now.{page.contact && ` Please contact ${page.businessName} on ${page.contact}.`}</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
