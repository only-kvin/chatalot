// Concurrency: people taking the same slot at the same moment. Hits the real
// dev Supabase project (no mocking) on a throwaway business — needs
// .env.local populated. Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { createBooking, type CreateBookingInput } from "../lib/bookings/create";
import { assignStaff, rescheduleBooking } from "../lib/bookings/manage";
import { addDays, localDateISO } from "../lib/time";

describe("booking concurrency", () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  // A week ahead: inside the default horizon, well past the notice period.
  const DATE = addDays(localDateISO(new Date()), 7);
  let tenantId: string;
  let serviceId: string;
  let thandi: string;
  let lebo: string;

  async function addService(name: string): Promise<string> {
    const { data, error } = await admin
      .from("services")
      .insert({ tenant_id: tenantId, name, duration_minutes: 30 })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function addStaff(name: string, maxConcurrent = 1): Promise<string> {
    const { data, error } = await admin
      .from("staff")
      .insert({ tenant_id: tenantId, name, max_concurrent: maxConcurrent })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  function booking(time: string, n: number, extra: Partial<CreateBookingInput> = {}): CreateBookingInput {
    return {
      tenantId,
      serviceId,
      date: DATE,
      time,
      customer: { name: `Customer ${n}`, phone: `08200000${String(n).padStart(2, "0")}`, email: null, contactId: null },
      conversationId: null,
      source: "widget",
      lead: { source: "widget", summary: "test" },
      actor: "ai",
      channel: "web",
      ...extra,
    };
  }

  async function bookingsAt(time: string) {
    const { data } = await admin
      .from("bookings")
      .select("id, staff_id")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .eq("starts_at", new Date(`${DATE}T${time}:00+02:00`).toISOString());
    return data ?? [];
  }

  beforeAll(async () => {
    const tenant = await createTenant(admin, { name: "Test Concurrency", slug: `test-concurrency-${suffix}` });
    tenantId = tenant.id;
    serviceId = await addService("Cut");
    const { error } = await admin.from("availability_rules").insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ tenant_id: tenantId, weekday, start_time: "08:00", end_time: "18:00" })),
    );
    if (error) throw error;
  });

  afterAll(async () => {
    // Bookings first: services and staff can't be deleted under them.
    await admin.from("bookings").delete().eq("tenant_id", tenantId);
    await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("gives two people racing for one slot one booking and one refusal", async () => {
    const results = await Promise.all([createBooking(admin, booking("09:00", 1)), createBooking(admin, booking("09:00", 2))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    // slot_taken if both passed the availability check; unavailable if the
    // winner had already committed when the loser checked.
    const reasons = results.flatMap((r) => (r.ok ? [] : [r.reason]));
    expect(reasons).toHaveLength(1);
    expect(["slot_taken", "unavailable"]).toContain(reasons[0]);
    expect(await bookingsAt("09:00")).toHaveLength(1);
  });

  it("files the lead and history together with the booking", async () => {
    const result = await createBooking(admin, booking("09:30", 3));
    if (!result.ok) throw new Error(result.reason);
    const { data } = await admin
      .from("bookings")
      .select("lead_id, block_start, block_end, booking_events(type)")
      .eq("id", result.bookingId)
      .single();
    expect(data?.lead_id).toBeTruthy();
    expect(data?.booking_events).toEqual([{ type: "created" }]);
  });

  it("books a double-submitted request once", async () => {
    const key = `test-key-${suffix}`;
    const results = await Promise.all([
      createBooking(admin, booking("11:00", 4, { idempotencyKey: key })),
      createBooking(admin, booking("11:00", 4, { idempotencyKey: key })),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.bookingId : null)));
    expect(ids.size).toBe(1);
    expect(await bookingsAt("11:00")).toHaveLength(1);
  });

  it("won't move a booking onto a taken slot", async () => {
    const mine = await createBooking(admin, booking("12:00", 5));
    if (!mine.ok) throw new Error(mine.reason);
    const moved = await rescheduleBooking(admin, {
      tenantId,
      bookingId: mine.bookingId,
      date: DATE,
      time: "09:00", // taken in the first test
      actor: "ai",
      channel: "web",
    });
    expect(moved.ok).toBe(false);
    const ok = await rescheduleBooking(admin, {
      tenantId,
      bookingId: mine.bookingId,
      date: DATE,
      time: "13:00",
      actor: "ai",
      channel: "web",
    });
    expect(ok.ok).toBe(true);
  });

  // Staff from here on: the business becomes one calendar per person.
  it("fills a class up to its capacity and no further", async () => {
    const studio = await addStaff("Studio", 2);
    const yoga = await addService("Yoga");
    await admin.from("staff_services").insert({ tenant_id: tenantId, staff_id: studio, service_id: yoga });

    const results = await Promise.all(
      [6, 7, 8].map((n) => createBooking(admin, booking("15:00", n, { serviceId: yoga, staffId: studio }))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await bookingsAt("15:00")).toHaveLength(2);
  });

  it("spreads 'anyone' bookings across free staff, one each", async () => {
    thandi = await addStaff("Thandi");
    lebo = await addStaff("Lebo");
    const cut = await addService("Blow-dry");
    await admin.from("staff_services").insert([
      { tenant_id: tenantId, staff_id: thandi, service_id: cut },
      { tenant_id: tenantId, staff_id: lebo, service_id: cut },
    ]);

    const results = await Promise.all([9, 10, 11].map((n) => createBooking(admin, booking("16:00", n, { serviceId: cut }))));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const booked = await bookingsAt("16:00");
    expect(booked).toHaveLength(2);
    expect(new Set(booked.map((b) => b.staff_id))).toEqual(new Set([thandi, lebo]));
  });

  it("gives an unassigned booking to someone free, and refuses someone busy", async () => {
    // 11:00 was booked before the business had staff.
    const [unassigned] = await bookingsAt("11:00");
    expect(unassigned.staff_id).toBeNull();
    const given = await assignStaff(admin, { tenantId, bookingId: unassigned.id, staffId: thandi, actor: "ai", channel: "web" });
    expect(given).toEqual({ ok: true });
    expect((await bookingsAt("11:00"))[0].staff_id).toBe(thandi);

    // Both are booked at 16:00, so Thandi's can't go to Lebo.
    const thandis = (await bookingsAt("16:00")).find((b) => b.staff_id === thandi)!;
    const refused = await assignStaff(admin, { tenantId, bookingId: thandis.id, staffId: lebo, actor: "ai", channel: "web" });
    expect(refused.ok).toBe(false);
  });
});
