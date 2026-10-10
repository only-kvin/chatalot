// Call-outs against the real dev Supabase project (no mocking of the
// database) on throwaway businesses: the address rules, travel buffers,
// arrival windows, service areas, approval, the agreed fee, the emergency
// path and tenant isolation. Emails and WhatsApp sends are mocked. Needs
// .env.local populated. Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

vi.mock("../lib/email/send", async (orig) => ({
  ...(await orig<typeof import("../lib/email/send")>()),
  sendOwnerEmail: vi.fn(async () => {}),
  sendCustomerEmail: vi.fn(async () => {}),
}));
vi.mock("../lib/channels/whatsapp", async (orig) => ({
  ...(await orig<typeof import("../lib/channels/whatsapp")>()),
  sendWhatsAppText: vi.fn(async () => {}),
  sendWhatsAppTemplate: vi.fn(async () => {}),
}));

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { createBooking, type CreateBookingInput } from "../lib/bookings/create";
import { getOpenSlots } from "../lib/bookings/availability";
import { rescheduleBooking } from "../lib/bookings/manage";
import { executeTool, type ToolContext } from "../lib/agent/engine";
import { sendOwnerEmail } from "../lib/email/send";
import { sendWhatsAppTemplate } from "../lib/channels/whatsapp";
import { encrypt } from "../lib/security/crypto";
import { addDays, localDateISO, localToUtcDate } from "../lib/time";

const admin = createAdminClient();
const suffix = Date.now();
// A week ahead: inside the horizon, past the notice period.
const DATE = addDays(localDateISO(new Date()), 7);
const ADDRESS = { line: "12 Oak Street", suburb: "Sandton", city: "Johannesburg", postalCode: "2196", accessNotes: "Gate 1234" };

let tenantId: string;
let otherTenantId: string;
const services: Record<string, string> = {};
const userIds: string[] = [];

async function addService(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("services")
    .insert({ tenant_id: tenantId, duration_minutes: 60, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function setConfig(values: Record<string, unknown>) {
  const { error } = await admin.from("agent_configs").update(values).eq("tenant_id", tenantId);
  if (error) throw error;
}

function input(serviceId: string, time: string, extra: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    tenantId,
    serviceId,
    date: DATE,
    time,
    customer: { name: "Sipho", phone: "0825550142", email: null, contactId: null },
    conversationId: null,
    source: "widget",
    lead: null,
    actor: "customer",
    channel: "web",
    ...extra,
  };
}

// Straight to the database function, skipping the app's checks.
function rpc(serviceId: string, time: string, extra: Record<string, unknown> = {}) {
  return admin.rpc("create_booking", {
    p_tenant_id: tenantId,
    p_service_id: serviceId,
    p_staff_id: null,
    p_starts_at: localToUtcDate(DATE, time).toISOString(),
    p_name: "Direct",
    p_phone: "0820000000",
    p_email: null,
    p_contact_id: null,
    p_conversation_id: null,
    p_source: "team",
    p_notes: "",
    p_details: {},
    p_idempotency_key: null,
    p_lead_source: null,
    p_lead_summary: null,
    p_actor: "team",
    p_channel: "dashboard",
    p_created_by: null,
    ...extra,
  });
}

async function clearBookings() {
  await admin.from("bookings").delete().eq("tenant_id", tenantId);
}

beforeAll(async () => {
  tenantId = (await createTenant(admin, { name: "Test Callouts", slug: `test-callouts-${suffix}` })).id;
  otherTenantId = (await createTenant(admin, { name: "Test Callouts Other", slug: `test-callouts-other-${suffix}` })).id;
  const { error } = await admin
    .from("availability_rules")
    .insert([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ tenant_id: tenantId, weekday, start_time: "08:00", end_time: "18:00" })));
  if (error) throw error;
  services.salon = await addService({ name: "Haircut", location: "business", price_cents: 25000 });
  services.repair = await addService({ name: "Repair", location: "customer", callout_fee_cents: 45000 });
  services.callout = await addService({
    name: "Call-out",
    location: "customer",
    price_type: "on_inspection",
    callout_fee_cents: 45000,
    arrival_window_minutes: 120,
  });
  services.massage = await addService({ name: "Massage", location: "either", price_cents: 60000, callout_fee_cents: 20000 });
  await setConfig({ travel_buffer_minutes: 30, service_areas: ["Sandton", "Rosebank, Johannesburg"], business_name: "Pipe Pros" });
}, 30_000);

// Each test starts with an empty calendar, even after a failure.
afterEach(async () => {
  await clearBookings();
});

afterAll(async () => {
  for (const id of [tenantId, otherTenantId]) {
    await admin.from("bookings").delete().eq("tenant_id", id);
    await admin.from("tenants").delete().eq("id", id);
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}, 30_000);

describe("addresses", { timeout: 30_000 }, () => {
  it("refuses a customer booking without an address, in the database and in the app", async () => {
    // The check constraint, for anything that writes directly.
    const direct = await admin.from("bookings").insert({
      tenant_id: tenantId,
      service_id: services.repair,
      name: "X",
      phone: "0820000000",
      starts_at: localToUtcDate(DATE, "08:00").toISOString(),
      ends_at: localToUtcDate(DATE, "09:00").toISOString(),
      location: "customer",
    });
    expect(direct.error?.message).toContain("bookings_customer_address_check");

    const viaFunction = await rpc(services.repair, "08:00", { p_location: "customer" });
    expect(viaFunction.data).toEqual({ ok: false, reason: "address_required" });

    expect(await createBooking(admin, input(services.repair, "08:00"))).toEqual({ ok: false, reason: "address_required" });
    expect(await createBooking(admin, input(services.repair, "08:00", { address: { line: "12 Oak St", suburb: "" } }))).toEqual({
      ok: false,
      reason: "address_required",
    });
  });

  it("needs no address at the business", async () => {
    const booked = await createBooking(admin, input(services.salon, "08:00"));
    expect(booked).toMatchObject({ ok: true, location: "business", calloutFeeCents: null, windowEnd: null });
    await clearBookings();
  });

  it("stores the chosen place for 'either' services, and only 'at yours' needs the address", async () => {
    const here = await createBooking(admin, input(services.massage, "08:00", { location: "business" }));
    expect(here).toMatchObject({ ok: true, location: "business", calloutFeeCents: null });
    expect(await createBooking(admin, input(services.massage, "12:00", { location: "customer" }))).toEqual({
      ok: false,
      reason: "address_required",
    });
    const theirs = await createBooking(admin, input(services.massage, "12:00", { location: "customer", address: ADDRESS }));
    expect(theirs).toMatchObject({ ok: true, location: "customer", calloutFeeCents: 20000 });

    const { data } = await admin
      .from("bookings")
      .select("location, address_line, suburb, access_notes")
      .eq("tenant_id", tenantId)
      .order("starts_at");
    expect(data).toEqual([
      { location: "business", address_line: null, suburb: null, access_notes: null },
      { location: "customer", address_line: "12 Oak Street", suburb: "Sandton", access_notes: "Gate 1234" },
    ]);
    // A salon-only service can't be booked at the customer's.
    expect(await createBooking(admin, input(services.salon, "15:00", { location: "customer", address: ADDRESS }))).toEqual({
      ok: false,
      reason: "invalid_location",
    });
    await clearBookings();
  });
});

describe("travel buffer", { timeout: 30_000 }, () => {
  it("keeps call-outs job + travel apart, and leaves bookings at the business alone", async () => {
    expect(await createBooking(admin, input(services.repair, "10:00", { address: ADDRESS }))).toMatchObject({ ok: true });
    const { data: row } = await admin.from("bookings").select("block_start, block_end").eq("tenant_id", tenantId).single();
    expect(new Date(row!.block_start).toISOString()).toBe(localToUtcDate(DATE, "09:30").toISOString());
    expect(new Date(row!.block_end).toISOString()).toBe(localToUtcDate(DATE, "11:30").toISOString());

    const open = (await getOpenSlots(admin, tenantId, services.repair, DATE))!.slots;
    expect(open).not.toContain("11:00");
    expect(open).toContain("12:00");
    // The database refuses it too, even without the app's check.
    expect((await rpc(services.repair, "11:00", { p_location: "customer", p_address_line: "1 A St", p_suburb: "Sandton" })).data).toEqual({
      ok: false,
      reason: "slot_taken",
    });
    // Travel either side of both jobs: 11:00 + 30 + 30 = 12:00 at the earliest.
    expect(await createBooking(admin, input(services.repair, "11:30", { address: ADDRESS }))).toMatchObject({ ok: false });
    expect(await createBooking(admin, input(services.repair, "12:00", { address: ADDRESS }))).toMatchObject({ ok: true });
    await clearBookings();

    // At the business there's no travel: a haircut fits right after another.
    await createBooking(admin, input(services.salon, "10:00"));
    expect((await getOpenSlots(admin, tenantId, services.salon, DATE))!.slots).toContain("11:00");
    await clearBookings();
  });
});

describe("arrival windows", { timeout: 30_000 }, () => {
  it("books a window and doesn't sell it, or the next, again", async () => {
    const before = (await getOpenSlots(admin, tenantId, services.callout, DATE))!;
    expect(before.windows).toEqual([
      { start: "08:00", end: "10:00" },
      { start: "10:00", end: "12:00" },
      { start: "12:00", end: "14:00" },
      { start: "14:00", end: "16:00" },
      { start: "16:00", end: "18:00" },
    ]);

    const booked = await createBooking(admin, input(services.callout, "08:00", { address: ADDRESS }));
    expect(booked).toMatchObject({ ok: true, windowEnd: localToUtcDate(DATE, "10:00").toISOString().replace(".000Z", "+00:00") });

    const after = (await getOpenSlots(admin, tenantId, services.callout, DATE))!;
    expect(after.slots).toEqual(["12:00", "14:00", "16:00"]);
    // Whole window + job + travel: 07:30 to 11:30.
    const { data: row } = await admin.from("bookings").select("block_start, block_end, arrival_window_end").eq("tenant_id", tenantId).single();
    expect(new Date(row!.block_end).toISOString()).toBe(localToUtcDate(DATE, "11:30").toISOString());
    expect(new Date(row!.arrival_window_end).toISOString()).toBe(localToUtcDate(DATE, "10:00").toISOString());
    expect((await rpc(services.callout, "10:00", { p_location: "customer", p_address_line: "1 A St", p_suburb: "Sandton" })).data).toEqual({
      ok: false,
      reason: "slot_taken",
    });
    await clearBookings();
  });
});

describe("approval and service areas", { timeout: 30_000 }, () => {
  it("makes call-outs requests unless confirmed instantly; outside the area always waits", async () => {
    await setConfig({ callouts_confirm_instantly: false, bookings_need_approval: false });
    expect(await createBooking(admin, input(services.repair, "08:00", { address: ADDRESS }))).toMatchObject({
      ok: true,
      status: "pending",
      outsideArea: false,
    });
    // Bookings at the business follow the general setting.
    expect(await createBooking(admin, input(services.salon, "14:00"))).toMatchObject({ ok: true, status: "confirmed" });

    await setConfig({ callouts_confirm_instantly: true });
    expect(
      await createBooking(admin, input(services.repair, "10:30", { address: { ...ADDRESS, suburb: " rosebank ", city: "Johannesburg" } })),
    ).toMatchObject({ ok: true, status: "confirmed", outsideArea: false });

    const outside = await createBooking(admin, input(services.repair, "16:00", { address: { ...ADDRESS, suburb: "Soweto" } }));
    expect(outside).toMatchObject({ ok: true, status: "pending", outsideArea: true });
    const { data } = await admin.from("bookings").select("outside_service_area").eq("tenant_id", tenantId).eq("suburb", "Soweto").single();
    expect(data?.outside_service_area).toBe(true);
    await setConfig({ callouts_confirm_instantly: false });
    await clearBookings();
  });
});

describe("the agreed call-out fee", { timeout: 30_000 }, () => {
  it("stays as booked when the service's fee changes, and when the booking moves", async () => {
    const booked = await createBooking(admin, input(services.callout, "12:00", { address: ADDRESS }));
    if (!booked.ok) throw new Error(booked.reason);
    expect(booked.calloutFeeCents).toBe(45000);

    await admin.from("services").update({ callout_fee_cents: 60000 }).eq("tenant_id", tenantId).eq("id", services.callout);
    const moved = await rescheduleBooking(admin, { tenantId, bookingId: booked.bookingId, date: DATE, time: "16:00", actor: "team", channel: "dashboard" });
    expect(moved.ok).toBe(true);
    const { data } = await admin
      .from("bookings")
      .select("callout_fee_cents, arrival_window_end, starts_at")
      .eq("tenant_id", tenantId)
      .eq("id", booked.bookingId)
      .single();
    expect(data?.callout_fee_cents).toBe(45000);
    // The window moved with it.
    expect(new Date(data!.arrival_window_end).toISOString()).toBe(localToUtcDate(DATE, "18:00").toISOString());

    await admin.from("services").update({ callout_fee_cents: 45000 }).eq("tenant_id", tenantId).eq("id", services.callout);
    await clearBookings();
  });
});

describe("emergencies", { timeout: 30_000 }, () => {
  it("flags the chat and lead urgent, alerts the owner, hands over, and offers no times", async () => {
    await setConfig({ emergency_callouts: true, emergency_note: "We'll call you back within 30 minutes.", owner_alert_phone: "082 111 2222" });
    // A connected WhatsApp number, so the owner's phone can be messaged.
    const { error: channelError } = await admin.from("channels").insert({
      tenant_id: tenantId,
      type: "whatsapp",
      wa_phone_number_id: `9${suffix}`,
      wa_access_token_encrypted: encrypt("test-token"),
    });
    if (channelError) throw channelError;
    const { data: conversation } = await admin
      .from("conversations")
      .insert({ tenant_id: tenantId, channel: "whatsapp", external_id: `2782555${String(suffix).slice(-4)}` })
      .select("id")
      .single();
    const ctx: ToolContext = {
      tenantId,
      businessName: "Pipe Pros",
      conversationId: conversation!.id,
      channel: "whatsapp",
      whatsappAvailable: false,
      cutoffMinutes: 120,
      takesBookings: true,
      emergencyCallouts: true,
      emergencyNote: "We'll call you back within 30 minutes.",
    };
    vi.mocked(sendOwnerEmail).mockClear();
    vi.mocked(sendWhatsAppTemplate).mockClear();

    const result = await executeTool(admin, ctx, {
      name: "report_emergency",
      input: { problem: "Burst pipe, water everywhere", name: "Sipho", phone: "0825550142", address: "12 Oak St, Sandton" },
    });
    expect(result).toContain("Do not offer booking times");
    expect(result).toContain("We'll call you back within 30 minutes.");

    const [{ data: convo }, { data: leads }, { data: notes }] = await Promise.all([
      admin.from("conversations").select("urgent, status").eq("tenant_id", tenantId).eq("id", conversation!.id).single(),
      admin.from("leads").select("urgent, interest, phone").eq("tenant_id", tenantId).eq("conversation_id", conversation!.id),
      admin.from("notifications").select("type, title").eq("tenant_id", tenantId).eq("conversation_id", conversation!.id),
    ]);
    expect(convo).toEqual({ urgent: true, status: "human" });
    expect(leads).toEqual([{ urgent: true, interest: "Emergency call-out", phone: "0825550142" }]);
    expect(notes).toEqual([{ type: "urgent", title: "URGENT: Burst pipe, water everywhere" }]);
    expect(sendOwnerEmail).toHaveBeenCalledWith(admin, tenantId, expect.objectContaining({ subject: expect.stringContaining("URGENT") }));
    // Outside the owner's 24-hour window: the urgent_alert template, to their mobile.
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(`9${suffix}`, "test-token", "27821112222", "urgent_alert", "en", [
      "Pipe Pros",
      "Burst pipe, water everywhere",
      "Sipho, 0825550142",
    ]);

    // No slots in an urgent chat.
    const check = await executeTool(admin, ctx, { name: "check_availability", input: { service: "Repair", date: DATE } });
    expect(check).toContain("don't offer booking times");
    expect(check).not.toMatch(/\d{2}:\d{2}/);

    // Off: the tool refuses (and isn't offered; see callouts.test.ts).
    expect(await executeTool(admin, { ...ctx, emergencyCallouts: false }, { name: "report_emergency", input: { problem: "x" } })).toContain(
      "doesn't take emergency call-outs",
    );
  });
});

describe("the AI books a call-out", { timeout: 30_000 }, () => {
  it("asks where for 'either', needs the address, and states window, fee and request status", async () => {
    await setConfig({ cancellation_policy: "24 hours' notice please." });
    const { data: conversation } = await admin
      .from("conversations")
      .insert({ tenant_id: tenantId, channel: "web", external_id: `test-ai-${suffix}` })
      .select("id")
      .single();
    const ctx: ToolContext = {
      tenantId,
      businessName: "Pipe Pros",
      conversationId: conversation!.id,
      channel: "web",
      whatsappAvailable: false,
      cutoffMinutes: 120,
      takesBookings: true,
      cancellationPolicy: "24 hours' notice please.",
    };
    const run = (name: string, inputs: Record<string, unknown>) => executeTool(admin, ctx, { name, input: inputs });

    expect(await run("check_availability", { service: "Massage", date: DATE })).toContain("Ask which they'd like");
    const windows = await run("check_availability", { service: "Call-out", date: DATE });
    expect(windows).toContain("08:00–10:00");
    expect(windows).toContain("quoted on site (never state a price)");

    const base = { service: "Call-out", date: DATE, time: "08:00", name: "Sipho", phone: "0825550142" };
    expect(await run("create_booking", base)).toContain("needs the street address and suburb");
    const booked = await run("create_booking", { ...base, address_line: "12 Oak Street", suburb: "Soweto", access_notes: "Gate 1234" });
    expect(booked).toContain("Call-out requested (not yet confirmed)");
    expect(booked).toContain("between 08:00 and 10:00");
    expect(booked).toContain("Call-out fee R450, payable to Pipe Pros on arrival");
    expect(booked).toContain("isn't in the listed areas");
    expect(booked).toContain("24 hours' notice please.");
    await clearBookings();
  });
});

describe("tenant isolation", { timeout: 30_000 }, () => {
  it("never shows another business's booking addresses", async () => {
    const booked = await createBooking(admin, input(services.repair, "08:00", { address: ADDRESS }));
    expect(booked.ok).toBe(true);

    const email = `test-callouts-rls-${suffix}@example.com`;
    const { data: user, error } = await admin.auth.admin.createUser({ email, password: "test-password-0123!", email_confirm: true });
    if (error) throw error;
    userIds.push(user.user.id);
    await admin.from("tenant_members").insert({ tenant_id: otherTenantId, user_id: user.user.id, role: "owner" });

    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    await client.auth.signInWithPassword({ email, password: "test-password-0123!" });
    const { data: theirs } = await client.from("bookings").select("address_line, suburb, access_notes").eq("tenant_id", tenantId);
    expect(theirs).toEqual([]);
    const { data: anyAddress } = await client.from("bookings").select("id").eq("address_line", ADDRESS.line);
    expect(anyAddress).toEqual([]);
    // Nor its settings (service areas, the owner's mobile).
    const { data: config } = await client.from("agent_configs").select("owner_alert_phone").eq("tenant_id", tenantId);
    expect(config).toEqual([]);
    await clearBookings();
  });

  it("filters every new query by tenant", () => {
    // Each Supabase query in the code this phase added or changed names the
    // tenant (or, for tenants, its id) before the next query starts.
    const files = [
      "lib/agent/emergency.ts",
      "lib/email/notify-urgent.ts",
      "lib/bookings/create.ts",
      "lib/bookings/availability.ts",
      "lib/bookings/manage.ts",
      "lib/bookings/manage-link.ts",
      "lib/onboarding.ts",
      "lib/widgets/book.ts",
      "lib/contacts/customer-page.ts",
      "app/api/public/services/route.ts",
      "app/api/public/availability/route.ts",
      "app/(dashboard)/dashboard/bookings/day-view.tsx",
      "app/(dashboard)/dashboard/bookings/page.tsx",
      "app/(dashboard)/dashboard/bookings/[id]/page.tsx",
      "app/(dashboard)/dashboard/settings/booking-actions.ts",
      "app/(dashboard)/dashboard/conversations/actions.ts",
      "app/(dashboard)/dashboard/services/actions.ts",
    ];
    const unscoped: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const parts = source.split(/\.from\(/).slice(1);
      for (const [i, part] of parts.entries()) {
        // Up to the next query (or a generous slice of the statement). A
        // short part is one branch of a ternary sharing the filters after it.
        const query = (part.length < 200 ? part + (parts[i + 1] ?? "") : part).slice(0, 900);
        const table = /^"(\w+)"/.exec(query)?.[1];
        // A manage-link token is the customer's only credential: looked up by id alone.
        if (!table || file.endsWith("manage-link.ts")) continue;
        if (!/tenant_id|eq\("id", tenantId\)|eq\("id", who\.tenantId\)|eq\("id", booking\.tenant_id\)/.test(query)) {
          unscoped.push(`${file}: ${table}`);
        }
      }
    }
    expect(unscoped).toEqual([]);
  });
});
