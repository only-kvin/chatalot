// Call-outs and mobile services: the pure rules (no database). The
// database side is in callouts-db.test.ts.

import { describe, it, expect } from "vitest";
import { blockOffsets, computeSlots, type CalendarDay } from "../lib/bookings/availability";
import { calloutFeeNotice, priceLabel, resolveBookingLocation, timeRangeLabel } from "../lib/bookings/labels";
import { inServiceArea } from "../lib/bookings/service-area";
import { addressProblem, needsApproval } from "../lib/bookings/callout";
import { formatBookingWhen } from "../lib/bookings/when";
import { addressText, customerPlaceLines, mapsUrl, type BookingPlace } from "../lib/bookings/place";
import { calloutReminderExtras, reminderText } from "../lib/bookings/reminders";
import { buildSystemPrompt, type AgentConfig } from "../lib/agent/prompt";
import { parseToolInput, toolsFor } from "../lib/agent/tools";
import { stepsFor } from "../widget/appointment/flow";
import { localToUtcDate } from "../lib/time";

describe("price labels", () => {
  const fixed = { priceType: "fixed" as const, priceCents: 35000, calloutFeeCents: null };
  it("words every price type", () => {
    expect(priceLabel(fixed, false)).toBe("R350");
    expect(priceLabel({ ...fixed, priceType: "from" }, false)).toBe("from R350");
    expect(priceLabel({ ...fixed, priceType: "on_inspection" }, false)).toBe("Quoted on site");
    expect(priceLabel({ ...fixed, priceCents: null }, false)).toBeNull();
    expect(priceLabel({ ...fixed, priceCents: 35050 }, false)).toBe("R350.50");
  });

  it("adds the call-out fee only at the customer's address", () => {
    const withFee = { ...fixed, calloutFeeCents: 45000 };
    expect(priceLabel({ ...withFee, priceType: "on_inspection" }, true)).toBe("Quoted on site · call-out fee R450");
    expect(priceLabel(withFee, true)).toBe("R350 · call-out fee R450");
    expect(priceLabel({ ...withFee, priceType: "from" }, true)).toBe("from R350 · call-out fee R450");
    expect(priceLabel({ ...withFee, priceCents: null }, true)).toBe("Call-out fee R450");
    // At the business, no fee.
    expect(priceLabel(withFee, false)).toBe("R350");
  });

  it("states who the fee is paid to, and when", () => {
    expect(calloutFeeNotice(45000, "Pipe Pros")).toBe("Call-out fee R450, payable to Pipe Pros on arrival");
    expect(calloutFeeNotice(null, "Pipe Pros")).toBeNull();
    expect(calloutFeeNotice(0, "Pipe Pros")).toBeNull();
  });

  it("labels windows and exact times", () => {
    expect(timeRangeLabel("08:00", "10:00")).toBe("08:00–10:00");
    expect(timeRangeLabel("08:00", null)).toBe("08:00");
    expect(formatBookingWhen("2026-10-16T06:00:00Z", "2026-10-16T08:00:00Z")).toBe("Friday 16 October, between 08:00 and 10:00");
    expect(formatBookingWhen("2026-10-16T06:00:00Z", null)).toBe("Friday 16 October at 08:00");
  });
});

describe("where a booking happens", () => {
  it("lets 'either' services choose, and holds the others to their place", () => {
    expect(resolveBookingLocation("either", "customer")).toBe("customer");
    expect(resolveBookingLocation("either", "business")).toBe("business");
    expect(resolveBookingLocation("either", null)).toBe("business");
    expect(resolveBookingLocation("customer", null)).toBe("customer");
    expect(resolveBookingLocation("business", "customer")).toBeNull();
    expect(resolveBookingLocation("customer", "business")).toBeNull();
  });

  it("needs an address only at the customer's", () => {
    expect(addressProblem("business", null)).toBeNull();
    expect(addressProblem("customer", null)).toMatch(/street address/);
    expect(addressProblem("customer", { line: "12 Oak St", suburb: " " })).toMatch(/suburb/);
    expect(addressProblem("customer", { line: "12 Oak St", suburb: "Sandton" })).toBeNull();
  });

  it("shows the Where step only for services done at either place", () => {
    expect(stepsFor(false, true)).toEqual(["service", "where", "time", "details"]);
    expect(stepsFor(true, true)).toEqual(["service", "where", "staff", "time", "details"]);
    expect(stepsFor(true)).toEqual(["service", "staff", "time", "details"]);
  });
});

describe("service areas", () => {
  const areas = ["Sandton", "  randburg ", "Rosebank, Johannesburg", "Pretoria"];
  it("ignores case and spacing", () => {
    expect(inServiceArea(areas, "sandton")).toBe(true);
    expect(inServiceArea(areas, "  SANDTON  ")).toBe(true);
    expect(inServiceArea(areas, "Randburg")).toBe(true);
  });

  it("accepts 'Suburb, City' either way round", () => {
    expect(inServiceArea(areas, "Sandton, Johannesburg")).toBe(true);
    expect(inServiceArea(areas, "Rosebank")).toBe(true);
    expect(inServiceArea(areas, "rosebank,johannesburg")).toBe(true);
    // A listed city covers its suburbs when the customer gives the city.
    expect(inServiceArea(areas, "Hatfield", "Pretoria")).toBe(true);
  });

  it("doesn't stretch a listed suburb to its whole city", () => {
    expect(inServiceArea(areas, "Soweto, Johannesburg")).toBe(false);
    expect(inServiceArea(areas, "Midrand")).toBe(false);
    expect(inServiceArea(areas, "")).toBe(false);
  });

  it("takes any address when no areas are listed", () => {
    expect(inServiceArea([], "Anywhere")).toBe(true);
  });
});

describe("approval", () => {
  const base = { forTeam: false, outsideArea: false, bookingsNeedApproval: false, calloutsConfirmInstantly: false };
  it("makes call-outs requests unless the owner confirms them instantly", () => {
    expect(needsApproval({ ...base, location: "customer" })).toBe(true);
    expect(needsApproval({ ...base, location: "customer", calloutsConfirmInstantly: true })).toBe(false);
    // Whatever the general setting says.
    expect(needsApproval({ ...base, location: "customer", bookingsNeedApproval: false })).toBe(true);
  });

  it("always asks the owner about an address outside the listed areas", () => {
    expect(needsApproval({ ...base, location: "customer", outsideArea: true, calloutsConfirmInstantly: true })).toBe(true);
  });

  it("leaves bookings at the business to the usual setting, and the team's own bookings alone", () => {
    expect(needsApproval({ ...base, location: "business" })).toBe(false);
    expect(needsApproval({ ...base, location: "business", bookingsNeedApproval: true })).toBe(true);
    expect(needsApproval({ ...base, location: "customer", forTeam: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Travel buffer and arrival windows in the slot engine.
// ---------------------------------------------------------------------------

const DATE = "2026-10-16";
const NOW = localToUtcDate("2026-10-15", "08:00");
const at = (time: string) => localToUtcDate(DATE, time).getTime();
const RULES = { leadMinutes: 0, horizonDays: 60, slotMinutes: 30 };
const JOB = { durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };

function cal(bookings: { start: number; end: number }[] = [], hours = { start_time: "08:00", end_time: "18:00" }): CalendarDay {
  return { staffId: null, capacity: 1, windows: [hours], ownHours: false, timeOff: [], bookings, bookedToday: 0 };
}
const free = (service: Parameters<typeof computeSlots>[0]["service"], bookings: { start: number; end: number }[] = []) =>
  computeSlots({ dateISO: DATE, now: NOW, rules: RULES, service, exception: null, calendars: [cal(bookings)] }).filter(
    (s) => s.staffIds.length > 0,
  );

describe("travel buffer", () => {
  // A 10:00–11:00 call-out with 30 minutes' travel blocks 09:30–11:30.
  const existingCallout = { start: at("09:30"), end: at("11:30") };

  it("keeps two call-outs at least job + travel apart", () => {
    const times = free({ ...JOB, travelMinutes: 30 }, [existingCallout]).map((s) => s.time);
    // 08:00–09:00 + 30 min travel = 09:30: fits. 08:30 would end at 10:00.
    expect(times).toContain("08:00");
    expect(times).not.toContain("08:30");
    expect(times).not.toContain("11:30");
    expect(times).toContain("12:00");
  });

  it("doesn't apply at the business", () => {
    // Same calendar, a booking at the business needs no travel.
    const times = free(JOB, [existingCallout]).map((s) => s.time);
    expect(times).toContain("08:30");
    expect(times).toContain("11:30");
  });

  it("matches the database's blocking rule", () => {
    expect(blockOffsets({ ...JOB, travelMinutes: 30 })).toEqual({ before: 30, after: 90, busy: 60 });
    expect(blockOffsets({ ...JOB, bufferBeforeMinutes: 10, travelMinutes: 30, windowMinutes: 120 })).toEqual({
      before: 40,
      after: 210,
      busy: 180,
    });
  });
});

describe("arrival windows", () => {
  const WINDOW = { ...JOB, travelMinutes: 30, windowMinutes: 120 };

  it("offers windows aligned to their length, labelled start–end", () => {
    const slots = free(WINDOW);
    expect(slots.map((s) => `${s.time}–${s.end}`)).toEqual(["08:00–10:00", "10:00–12:00", "12:00–14:00", "14:00–16:00", "16:00–18:00"]);
  });

  it("aligns to the clock even when the business opens at an odd time", () => {
    const slots = computeSlots({
      dateISO: DATE,
      now: NOW,
      rules: RULES,
      service: WINDOW,
      exception: null,
      calendars: [cal([], { start_time: "07:30", end_time: "13:00" })],
    });
    expect(slots.map((s) => s.time)).toEqual(["08:00", "10:00"]);
  });

  it("doesn't sell a booked window again, nor its neighbours, while the job could still run", () => {
    // Booked 08:00–10:00: blocks 07:30 to 10:00 + 60 job + 30 travel = 11:30.
    const booked = { start: at("08:00") - 30 * 60_000, end: at("08:00") + 210 * 60_000 };
    const times = free(WINDOW, [booked]).map((s) => s.time);
    expect(times).not.toContain("08:00");
    expect(times).not.toContain("10:00");
    // 12:00 window blocks from 11:30: touching, not overlapping.
    expect(times).toEqual(["12:00", "14:00", "16:00"]);
  });

  it("gives one person three windows a day with 2-hour windows, a 1-hour job and 30 minutes' travel", () => {
    const taken: { start: number; end: number }[] = [];
    for (;;) {
      const next = free(WINDOW, taken)[0];
      if (!next) break;
      const start = at(next.time);
      const o = blockOffsets(WINDOW);
      taken.push({ start: start - o.before * 60_000, end: start + o.after * 60_000 });
    }
    expect(taken).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// What the customer is told.
// ---------------------------------------------------------------------------

const PLACE: BookingPlace = {
  location: "customer",
  address_line: "12 Oak Street",
  suburb: "Sandton",
  city: "Johannesburg",
  postal_code: "2196",
  access_notes: "Gate code 1234",
  arrival_window_end: "2026-10-16T08:00:00Z",
  callout_fee_cents: 45000,
};
const BIZ = { businessName: "Pipe Pros", businessAddress: "1 Main Rd", cancellationPolicy: "24 hours' notice please." };

describe("customer-facing place lines", () => {
  it("gives the address, fee and policy for a call-out", () => {
    expect(addressText(PLACE)).toBe("12 Oak Street, Sandton, Johannesburg, 2196");
    expect(mapsUrl(PLACE)).toBe("https://www.google.com/maps/search/?api=1&query=12%20Oak%20Street%2C%20Sandton%2C%20Johannesburg%2C%202196");
    expect(customerPlaceLines(PLACE, BIZ)).toEqual([
      ["Where", "12 Oak Street, Sandton, Johannesburg, 2196"],
      ["Payment", "Call-out fee R450, payable to Pipe Pros on arrival"],
      ["Cancellation policy", "24 hours' notice please."],
    ]);
  });

  it("gives the business address at the business, and no fee", () => {
    const here = { ...PLACE, location: "business", callout_fee_cents: null };
    expect(customerPlaceLines(here, BIZ)).toEqual([
      ["Where", "1 Main Rd"],
      ["Payment", null],
      ["Cancellation policy", "24 hours' notice please."],
    ]);
    expect(mapsUrl(here)).toBeNull();
  });

  it("writes reminders with the window, address, fee and policy", () => {
    const text = reminderText({
      name: "Sipho",
      service: "Call-out",
      business: "Pipe Pros",
      startsAt: "2026-10-16T06:00:00Z",
      place: PLACE,
      cancellationPolicy: BIZ.cancellationPolicy,
    });
    expect(text).toBe(
      "Hi Sipho, a reminder that Pipe Pros is coming to you for your Call-out on Friday 16 October, between 08:00 and 10:00, at 12 Oak Street, Sandton, Johannesburg, 2196. Call-out fee R450, payable to Pipe Pros on arrival. Cancellation policy: 24 hours' notice please. Reply here if you need to change it.",
    );
    // The template variable is never empty.
    expect(calloutReminderExtras({ business: "Pipe Pros", feeCents: null, policy: "" })).toBe("See you then.");
  });
});

// ---------------------------------------------------------------------------
// The AI.
// ---------------------------------------------------------------------------

const CONFIG: AgentConfig = {
  business_name: "Pipe Pros",
  tone: "friendly",
  greeting: "Hi",
  system_prompt_extra: "",
  handoff_contact: "",
};
const CALLOUT = {
  name: "Call-out",
  duration_minutes: 60,
  location: "customer" as const,
  price_type: "on_inspection" as const,
  price_cents: null,
  callout_fee_cents: 45000,
  arrival_window_minutes: 120,
};

describe("call-out rules in the prompt", () => {
  it("says on-inspection services have no stated price, and gives the fee", () => {
    const prompt = buildSystemPrompt(CONFIG, "", [CALLOUT]);
    expect(prompt).toContain(
      "Call-out (60 min; at the customer's address; quoted on site, no stated price; call-out fee R450; 2-hour arrival windows at their place)",
    );
    expect(prompt).toContain('For a service\n  "quoted on site", never state or estimate a price');
    expect(prompt).toContain("Call-out fee R450, payable to Pipe Pros on arrival");
    expect(prompt).toContain("always state the call-out fee");
  });

  it("lists the service areas and the cancellation policy", () => {
    const prompt = buildSystemPrompt({ ...CONFIG, service_areas: ["Sandton", "Randburg"], cancellation_policy: "24 hours' notice." }, "", [
      CALLOUT,
    ]);
    expect(prompt).toContain("Areas covered for call-outs: Sandton, Randburg.");
    expect(prompt).toContain("Cancellation policy: 24 hours' notice.");
    expect(prompt).toContain("mention the cancellation policy");
  });

  it("keeps the safety rule even with emergency call-outs off", () => {
    const prompt = buildSystemPrompt({ ...CONFIG, emergency_callouts: false }, "");
    expect(prompt).toContain("Safety first, always");
    expect(prompt).toContain("call emergency services");
    expect(prompt).not.toContain("report_emergency");
  });

  it("sends emergencies to report_emergency, passing on only the owner's own note", () => {
    const withNote = buildSystemPrompt({ ...CONFIG, emergency_callouts: true, emergency_note: "We'll call you within 30 minutes." }, "");
    expect(withNote).toContain("don't offer booking times");
    expect(withNote).toContain('"We\'ll call you within 30 minutes."');
    const withoutNote = buildSystemPrompt({ ...CONFIG, emergency_callouts: true, emergency_note: "" }, "");
    expect(withoutNote).toContain("without promising how quickly anyone will call");
  });

  it("only offers the emergency tool when the business takes emergencies", () => {
    expect(toolsFor(true, true).map((t) => t.name)).toContain("report_emergency");
    expect(toolsFor(true, false).map((t) => t.name)).not.toContain("report_emergency");
    // Without bookings: the core tools, plus emergencies if on.
    expect(toolsFor(false, true).map((t) => t.name)).toEqual(["save_lead", "request_human", "report_emergency"]);
  });

  it("parses location and address on the booking tools", () => {
    const call = parseToolInput({
      name: "create_booking",
      input: {
        service: "Call-out",
        date: "2026-10-16",
        time: "08:00",
        name: "Sipho",
        phone: "0825550142",
        location: "customer",
        address_line: "12 Oak St",
        suburb: "Sandton",
        access_notes: "",
      },
    });
    expect(call.ok && call.call.input).toMatchObject({ location: "customer", address_line: "12 Oak St", suburb: "Sandton", access_notes: null });
    const check = parseToolInput({ name: "check_availability", input: { service: "Massage", date: "2026-10-16", location: "somewhere" } });
    expect(check.ok && check.call.input).toMatchObject({ location: null });
  });
});
