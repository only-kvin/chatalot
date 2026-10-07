// The AI's booking tools with staff, run through the real tool runner (no
// model) against the dev Supabase project on a throwaway business — needs
// .env.local populated. Emails are mocked. Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../lib/email/notify-booking", () => ({ notifyOwnerOfBooking: vi.fn() }));
vi.mock("../lib/email/customer-booking", async (orig) => ({
  ...(await orig<typeof import("../lib/email/customer-booking")>()),
  emailCustomerAboutBooking: vi.fn(),
}));

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { executeTool, type ToolContext } from "../lib/agent/engine";
import { addDays, localDateISO } from "../lib/time";

describe("AI booking tools with staff", { timeout: 30_000 }, () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  const DATE = addDays(localDateISO(new Date()), 7);
  let ctx: ToolContext;
  let thandi: string;
  let slug: string;

  const run = (name: string, input: Record<string, unknown>) => executeTool(admin, ctx, { name, input });

  beforeAll(async () => {
    slug = `test-agent-staff-${suffix}`;
    const tenant = await createTenant(admin, { name: "Test Agent Staff", slug });
    const tenantId = tenant.id;
    const { data: services, error: servicesError } = await admin
      .from("services")
      .insert([
        { tenant_id: tenantId, name: "Men's Cut", duration_minutes: 30 },
        { tenant_id: tenantId, name: "Balayage", duration_minutes: 120 },
      ])
      .select("id, name");
    if (servicesError) throw servicesError;
    const { data: staff, error: staffError } = await admin
      .from("staff")
      .insert([
        { tenant_id: tenantId, name: "Thandi Mokoena", role: "Senior stylist", sort_order: 1 },
        { tenant_id: tenantId, name: "Lebo Dlamini", role: "", sort_order: 2 },
      ])
      .select("id, name");
    if (staffError) throw staffError;
    thandi = staff!.find((p) => p.name.startsWith("Thandi"))!.id;
    // Only Thandi does balayage; anyone does cuts.
    await admin.from("staff_services").insert({
      tenant_id: tenantId,
      staff_id: thandi,
      service_id: services!.find((s) => s.name === "Balayage")!.id,
    });
    await admin.from("availability_rules").insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ tenant_id: tenantId, weekday, start_time: "08:00", end_time: "18:00" })),
    );
    const { data: conversation } = await admin
      .from("conversations")
      .insert({ tenant_id: tenantId, channel: "web", external_id: `test-${suffix}` })
      .select("id")
      .single();
    ctx = { tenantId, businessName: "Test Agent Staff", conversationId: conversation!.id, channel: "web", whatsappAvailable: false, cutoffMinutes: 120, takesBookings: true };
  });

  afterAll(async () => {
    await admin.from("bookings").delete().eq("tenant_id", ctx.tenantId);
    await admin.from("tenants").delete().eq("id", ctx.tenantId);
  });

  it("checks a named person's times, and says who offers a service when nobody is named", async () => {
    expect(await run("check_availability", { service: "Men's Cut", date: DATE, staff: "Thandi" })).toMatch(/for Men's Cut with Thandi Mokoena: 08:00/);
    expect(await run("check_availability", { service: "Men's Cut", date: DATE })).toMatch(/Staff who do it: Thandi Mokoena, Lebo Dlamini/);
  });

  it("refuses a person who doesn't do the service, naming who does", async () => {
    expect(await run("check_availability", { service: "Balayage", date: DATE, staff: "Lebo" })).toBe(
      "Lebo Dlamini doesn't do Balayage. Thandi Mokoena does.",
    );
    expect(await run("check_availability", { service: "Balayage", date: DATE, staff: "Sipho" })).toMatch(/No staff member called "Sipho"/);
  });

  it("books the person asked for, and names them", async () => {
    const result = await run("create_booking", { service: "Men's Cut", date: DATE, time: "09:00", name: "Agent Test", phone: "083 000 0080", staff: "Thandi" });
    expect(result).toMatch(/^Booking confirmed: Men's Cut on .* at 09:00 with Thandi Mokoena \(reference/);
    const { data } = await admin.from("bookings").select("staff_id").eq("tenant_id", ctx.tenantId).eq("phone", "083 000 0080").single();
    expect(data?.staff_id).toBe(thandi);
  });

  it("says who 'anyone' went to", async () => {
    // Thandi is busy at 09:00, so it goes to Lebo.
    const result = await run("create_booking", { service: "Men's Cut", date: DATE, time: "09:00", name: "Agent Test 2", phone: "083 000 0081" });
    expect(result).toMatch(/with Lebo Dlamini/);
  });

  it("sends the booking link, with the service filled in", async () => {
    const result = await run("send_booking_link", { service: "Balayage" });
    expect(result).toMatch(new RegExp(`/book/${slug}\\?ca_service=[0-9a-f-]{36}`));
    // Online booking switched off: no link.
    await admin.from("widget_instances").insert({ tenant_id: ctx.tenantId, type: "appointment", active: false });
    expect(await run("send_booking_link", {})).toMatch(/doesn't take online bookings by link/);
  });
});
