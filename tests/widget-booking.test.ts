// Booking through the website widget, end to end against the real dev
// Supabase project on a throwaway business — needs .env.local populated.
// Emails are mocked; nothing is sent. Run with: pnpm test

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Work sent to the background with waitUntil, awaited by settle().
const background: Promise<unknown>[] = [];
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => background.push(p) }));
const settle = () => Promise.all(background.splice(0));
const customerEmails = vi.fn();
const ownerAlerts = vi.fn();
vi.mock("../lib/email/customer-booking", async (orig) => ({
  ...(await orig<typeof import("../lib/email/customer-booking")>()),
  emailCustomerAboutBooking: (...a: unknown[]) => customerEmails(...a),
}));
vi.mock("../lib/email/notify-booking", () => ({ notifyOwnerOfBooking: (...a: unknown[]) => ownerAlerts(...a) }));
// Every test request shares one IP; the real limit (5 per 10 min) would
// stop the suite. Checked here only for being consulted.
const bookingLimit = vi.fn(async () => true);
vi.mock("../lib/security/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../lib/security/rate-limit")>()),
  checkWidgetBookingLimit: (...a: unknown[]) => bookingLimit(...(a as [])),
}));

import { createAdminClient } from "../lib/db/supabase-admin";
import { createTenant } from "../lib/db/create-tenant";
import { bookFromWidget } from "../lib/widgets/book";
import { decidePendingBooking } from "../lib/bookings/manage";
import { POST as bookRoute } from "../app/api/public/appointments/route";
import { POST as rescheduleRoute } from "../app/api/public/reschedule/route";
import { GET as availabilityRoute } from "../app/api/public/availability/route";
import { createBookingToken } from "../lib/security/signed-token";
import { addDays, localDateISO } from "../lib/time";

// Each test makes many real database round trips.
describe("widget booking", { timeout: 30_000 }, () => {
  const admin = createAdminClient();
  const suffix = Date.now();
  const DATE = addDays(localDateISO(new Date()), 7);
  let tenantId: string;
  let publicKey: string;
  let serviceId: string;

  const answers = (n: number) => ({
    name: `Widget Customer ${n}`,
    phone: `08300000${String(n).padStart(2, "0")}`,
    email: null,
    notes: "",
    details: { custom_reg: "CA 123" },
  });
  const book = (time: string, n: number, key = `widget-test-${suffix}-${n}`) =>
    bookFromWidget(admin, {
      tenantId,
      serviceId,
      staffId: null,
      date: DATE,
      time,
      answers: answers(n),
      idempotencyKey: key,
      widget: "schedule",
    });

  beforeAll(async () => {
    const tenant = await createTenant(admin, { name: "Test Widget", slug: `test-widget-${suffix}` });
    tenantId = tenant.id;
    publicKey = tenant.public_widget_key;
    const { data: service, error } = await admin
      .from("services")
      .insert({ tenant_id: tenantId, name: "Cut", duration_minutes: 30 })
      .select("id")
      .single();
    if (error) throw error;
    serviceId = service.id;
    await admin.from("availability_rules").insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ tenant_id: tenantId, weekday, start_time: "08:00", end_time: "18:00" })),
    );
  });

  afterAll(async () => {
    await admin.from("bookings").delete().eq("tenant_id", tenantId);
    await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("saves the customer, the booking with its answers, and a lead, and tells both sides", async () => {
    const result = await book("09:00", 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.status).toBe("confirmed");

    const { data: booking } = await admin
      .from("bookings")
      .select("source, details, contact_id, lead_id, booking_events(type, actor)")
      .eq("id", result.bookingId)
      .single();
    expect(booking).toMatchObject({
      source: "widget",
      details: { custom_reg: "CA 123" },
      booking_events: [{ type: "created", actor: "customer" }],
    });
    expect(booking?.contact_id).toBeTruthy();
    await settle();
    const { data: lead } = await admin.from("leads").select("source").eq("id", booking!.lead_id).single();
    expect(lead?.source).toBe("schedule_widget");
    expect(ownerAlerts).toHaveBeenCalledWith(expect.anything(), tenantId, expect.any(String), expect.objectContaining({ viaWidget: true, pending: false }));
    expect(customerEmails).toHaveBeenCalledWith(expect.anything(), tenantId, result.bookingId, "confirmed");
  });

  it("holds the slot while a booking waits for approval, then frees it when declined", async () => {
    await admin.from("agent_configs").update({ bookings_need_approval: true }).eq("tenant_id", tenantId);
    const requested = await book("10:00", 2);
    if (!requested.ok) throw new Error(requested.reason);
    expect(requested.status).toBe("pending");
    await settle();
    expect(customerEmails).toHaveBeenLastCalledWith(expect.anything(), tenantId, requested.bookingId, "requested");

    // Someone else can't take the held time.
    expect(await book("10:00", 3)).toMatchObject({ ok: false });

    const declined = await decidePendingBooking(admin, {
      tenantId,
      bookingId: requested.bookingId,
      approve: false,
      reason: "Fully booked",
      actor: "team",
      channel: "dashboard",
    });
    expect(declined).toEqual({ ok: true });
    // Declining twice does nothing.
    expect((await decidePendingBooking(admin, { tenantId, bookingId: requested.bookingId, approve: true, actor: "team", channel: "dashboard" })).ok).toBe(false);
    // The time is free again.
    expect((await book("10:00", 4)).ok).toBe(true);
    await admin.from("agent_configs").update({ bookings_need_approval: false }).eq("tenant_id", tenantId);
  });

  describe("the public booking route", () => {
    const request = (body: Record<string, unknown>) =>
      new Request("http://localhost/api/public/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const body = (overrides: Record<string, unknown> = {}) => ({
      key: publicKey,
      widget: "schedule",
      serviceId,
      date: DATE,
      time: "14:00",
      answers: { full_name: "Route Customer", phone: "083 000 0099", email: "", notes: "" },
      consent: true,
      idempotencyKey: `route-${suffix}`,
      website: "",
      elapsedMs: 12_000,
      ...overrides,
    });

    it("books, and books once when the same submit arrives twice", async () => {
      const first = await bookRoute(request(body()));
      expect(first.status).toBe(200);
      const json = await first.json();
      expect(json).toMatchObject({ ok: true, status: "confirmed" });
      expect(json.ref).toMatch(/^[0-9A-F]{8}$/);

      const again = await bookRoute(request(body()));
      expect((await again.json()).ref).toBe(json.ref);
      expect(bookingLimit).toHaveBeenCalledWith("unknown", publicKey);
    });

    it("refuses missing consent, bad answers and taken times without saying why beyond what's needed", async () => {
      expect((await bookRoute(request(body({ consent: false, idempotencyKey: `c-${suffix}` })))).status).toBe(400);
      const badPhone = await bookRoute(request(body({ answers: { full_name: "X", phone: "12" }, idempotencyKey: `p-${suffix}` })));
      expect(badPhone.status).toBe(400);
      expect((await badPhone.json()).error).toMatch(/valid mobile number/);
      const taken = await bookRoute(request(body({ time: "09:00", idempotencyKey: `t-${suffix}` })));
      expect(taken.status).toBe(409);
      expect(await taken.json()).toEqual({ error: "Sorry, that time was just taken. Please pick another.", reason: "slot_taken" });
    });

    it("turns people away once the booking limit is reached", async () => {
      bookingLimit.mockResolvedValueOnce(false);
      const limited = await bookRoute(request(body({ time: "16:00", idempotencyKey: `l-${suffix}` })));
      expect(limited.status).toBe(429);
    });

    it("quietly drops bot submissions and refuses unknown keys", async () => {
      const bot = await bookRoute(request(body({ website: "http://spam", time: "15:00", idempotencyKey: `b-${suffix}` })));
      expect(bot.status).toBe(200);
      const { data } = await admin.from("bookings").select("id").eq("tenant_id", tenantId).eq("idempotency_key", `b-${suffix}`);
      expect(data).toEqual([]);
      expect((await bookRoute(request(body({ key: crypto.randomUUID() })))).status).toBe(404);
    });
  });

  describe("the appointment widget and rescheduling by link", () => {
    let staffA: string;
    const post = (url: string, body: Record<string, unknown>) =>
      new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const tokenFor = (id: string) => createBookingToken(id, new Date(Date.now() + 30 * 86_400_000));
    const at = async (id: string) =>
      (await admin.from("bookings").select("starts_at, staff_id, status").eq("id", id).single()).data!;
    const localIso = (time: string) => new Date(`${DATE}T${time}:00+02:00`).toISOString();

    beforeAll(async () => {
      const { data } = await admin
        .from("staff")
        .insert([
          { tenant_id: tenantId, name: "Staff A" },
          { tenant_id: tenantId, name: "Staff B" },
        ])
        .select("id, name");
      staffA = data!.find((p) => p.name === "Staff A")!.id;
    });

    it("books with the person the customer chose", async () => {
      const res = await bookRoute(
        post("/api/public/appointments", {
          key: publicKey,
          widget: "appointment",
          serviceId,
          staffId: staffA,
          date: DATE,
          time: "11:30",
          answers: { full_name: "Appointment Customer", phone: "083 000 0098" },
          consent: true,
          idempotencyKey: `appt-${suffix}`,
          elapsedMs: 9_000,
        }),
      );
      expect(res.status).toBe(200);
      const { ref } = await res.json();
      const { data } = await admin.from("bookings").select("staff_id, leads(source)").eq("tenant_id", tenantId).eq("idempotency_key", `appt-${suffix}`).single();
      expect(ref).toBeTruthy();
      expect(data).toMatchObject({ staff_id: staffA, leads: { source: "appointment_widget" } });
    });

    it("moves a booking from the email link, as the customer", async () => {
      const made = await book("12:00", 20, `move-${suffix}`);
      if (!made.ok) throw new Error(made.reason);
      const res = await rescheduleRoute(post("/api/public/reschedule", { token: tokenFor(made.bookingId), date: DATE, time: "13:00" }));
      expect(res.status).toBe(200);
      expect((await at(made.bookingId)).starts_at).toBe(localIso("13:00").replace(".000Z", "+00:00"));
      const { data: events } = await admin.from("booking_events").select("type, actor").eq("booking_id", made.bookingId).order("created_at");
      expect(events?.at(-1)).toEqual({ type: "rescheduled", actor: "customer" });
    });

    it("counts the booking's own time as free only for its own link", async () => {
      // Both people busy at 13:00: the moved booking, plus another.
      const other = await book("13:00", 21, `other-${suffix}`);
      if (!other.ok) throw new Error(other.reason);
      const { data: moved } = await admin.from("bookings").select("id").eq("idempotency_key", `move-${suffix}`).single();
      const slotAt = async (token?: string) => {
        const url = new URL("http://localhost/api/public/availability");
        Object.entries({ key: publicKey, service: serviceId, from: DATE, to: DATE, ...(token ? { token } : {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
        const json = await (await availabilityRoute(new Request(url))).json();
        return json.days[0].slots.find((s: { time: string }) => s.time === "13:00");
      };
      expect(await slotAt()).toEqual({ time: "13:00", available: false });
      expect(await slotAt(tokenFor(moved!.id))).toEqual({ time: "13:00", available: true });
    });

    it("refuses altered links, taken times, cancelled bookings and changes inside the cutoff", async () => {
      // 14:00 went to an earlier test; 17:00 is free.
      const made = await book("17:00", 22, `refuse-${suffix}`);
      if (!made.ok) throw new Error(made.reason);
      const good = tokenFor(made.bookingId);

      const tampered = `${good.slice(0, -2)}xx`;
      expect((await rescheduleRoute(post("/api/public/reschedule", { token: tampered, date: DATE, time: "15:30" }))).status).toBe(404);

      // 13:00 is taken by both people now.
      const taken = await rescheduleRoute(post("/api/public/reschedule", { token: good, date: DATE, time: "13:00" }));
      expect(taken.status).toBe(409);
      expect((await taken.json()).reason).toBe("slot_taken");

      // Inside the cutoff: a booking two days out, with a week's notice required.
      const soon = await bookFromWidget(admin, {
        tenantId,
        serviceId,
        staffId: null,
        date: addDays(localDateISO(new Date()), 2),
        time: "10:00",
        answers: answers(23),
        idempotencyKey: `soon-${suffix}`,
        widget: "schedule",
      });
      if (!soon.ok) throw new Error(soon.reason);
      await admin.from("agent_configs").update({ booking_change_cutoff_minutes: 10080 }).eq("tenant_id", tenantId);
      const tooLate = await rescheduleRoute(post("/api/public/reschedule", { token: tokenFor(soon.bookingId), date: DATE, time: "15:30" }));
      await admin.from("agent_configs").update({ booking_change_cutoff_minutes: 120 }).eq("tenant_id", tenantId);
      expect(tooLate.status).toBe(409);
      expect((await tooLate.json()).error).toMatch(/too close/);

      await admin.from("bookings").update({ status: "cancelled" }).eq("id", made.bookingId);
      expect((await rescheduleRoute(post("/api/public/reschedule", { token: good, date: DATE, time: "15:30" }))).status).toBe(409);
      expect((await at(made.bookingId)).starts_at).toBe(localIso("17:00").replace(".000Z", "+00:00"));
    });
  });
});
