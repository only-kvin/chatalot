import { addDays, weekdayOf } from "../../lib/time";
import type { Slot } from "./calendar";
import type { BaseConfig, Service } from "./api";

// Sample data for preview mode (data-preview on the widget's box): lets the
// team building a website lay out and style the page before the business
// has added services or opening hours. Never sent anywhere.

export const SAMPLE_SERVICES: Service[] = [
  sample("sample-1", "Consultation", "A first chat about what you need.", 30, 0, "fixed"),
  sample("sample-2", "Standard appointment", "Our most popular service.", 60, 45000, "fixed"),
  sample("sample-3", "Premium appointment", "The full treatment, with extras.", 90, 75000, "from"),
];

function sample(id: string, name: string, description: string, durationMinutes: number, priceCents: number, priceType: Service["priceType"]): Service {
  return {
    id,
    name,
    description,
    category: "",
    durationMinutes,
    priceCents: priceCents || null,
    staffIds: [],
    location: "business",
    priceType,
    calloutFeeCents: null,
    arrivalWindowMinutes: null,
  };
}

export const isSample = (serviceId: string) => serviceId.startsWith("sample-");

// Weekdays and Saturday mornings, every 30 minutes, a few taken.
export function sampleDays(from: string, to: string): { date: string; slots: Slot[] }[] {
  const days: { date: string; slots: Slot[] }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = weekdayOf(d);
    const close = weekday === 0 ? 0 : weekday === 6 ? 13 : 17;
    const slots: Slot[] = [];
    for (let h = 9; h < close; h++) {
      for (const m of ["00", "30"]) {
        const time = `${String(h).padStart(2, "0")}:${m}`;
        slots.push({ time, available: (h * 7 + Number(d.slice(8)) + (m === "30" ? 3 : 0)) % 5 !== 0 });
      }
    }
    days.push({ date: d, slots });
  }
  return days;
}

// When even the business's settings can't be loaded (not approved yet, or
// the widget isn't in their plan), preview still shows the layout.
export function sampleConfig<T extends BaseConfig>(): T {
  return {
    businessName: "Your business",
    contact: "",
    theme: { primary: "#4f46e5", surface: "#ffffff", text: "#18181b", radius: 20, font: "system", mode: "light" },
    fields: [
      { key: "full_name", label: "Full name", type: "text", required: true },
      { key: "phone", label: "Phone", type: "tel", required: true },
      { key: "email", label: "Email", type: "email", required: false },
    ],
    copy: {
      title: "Book an appointment",
      confirmButton: "Confirm booking",
      successTitle: "You're booked!",
      successMessage: "See you soon!",
      requestedTitle: "Request received",
      requestedMessage: "",
      nextSteps: "",
    },
    settings: { allowAnyStaff: true, groupByCategory: false, allowStaffChoice: true },
  } as unknown as T;
}

export const PREVIEW_NOTE = {
  sample:
    "Preview with sample services and times. This widget isn't set up yet: the business adds its services and opening hours in its Bookfront dashboard, or its onboarding specialist can help. Nothing here is booked.",
  real: "Preview: the business's real services and times, but nothing here is booked.",
  draft: "Test widget (Draft): bookings are switched off until it's made Live.",
};
