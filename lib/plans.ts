import { z } from "zod";

// Plans and the features they include. Leads, knowledge, conversations and
// customers are part of every plan and aren't listed. Pricing changes are a
// code change on purpose: one place, reviewed, deployed.

export const FEATURES = ["web_chat", "contact_form", "whatsapp", "bookings", "reviews", "registration"] as const;
export type Feature = (typeof FEATURES)[number];

export const PLANS = ["starter", "growth", "pro", "trial"] as const;
export type Plan = (typeof PLANS)[number];

const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  starter: ["web_chat", "contact_form"],
  growth: ["web_chat", "contact_form", "whatsapp", "bookings"],
  pro: FEATURES,
  // Everything unlocked, so owners see what they'd lose.
  trial: FEATURES,
};

export const PLAN_LABEL: Record<Plan, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  trial: "Trial",
};

// Features that only work on top of another: review requests go out after an
// attended booking. If the base isn't on, the dependant takes its state.
const REQUIRES: Partial<Record<Feature, Feature>> = { reviews: "bookings" };

// on: usable. locked: not in their plan, shown to the owner as an upsell.
// hidden: switched off by the platform admin because it doesn't fit the
// business; the owner never sees it. Customers and the AI treat locked and
// hidden the same — the feature doesn't exist.
export type FeatureState = "on" | "locked" | "hidden";
export type Features = Record<Feature, FeatureState>;

export const overridesSchema = z.partialRecord(z.enum(FEATURES), z.enum(["on", "off"]));
export type Overrides = z.infer<typeof overridesSchema>;

export function parsePlan(value: unknown): Plan {
  return PLANS.includes(value as Plan) ? (value as Plan) : "starter";
}

export function resolveFeatures(plan: Plan, rawOverrides: unknown): Features {
  // Bad override data is ignored rather than failing the whole page.
  const parsed = overridesSchema.safeParse(rawOverrides);
  const overrides: Overrides = parsed.success ? parsed.data : {};

  const own = (f: Feature): FeatureState =>
    overrides[f] === "off" ? "hidden" : overrides[f] === "on" || PLAN_FEATURES[plan].includes(f) ? "on" : "locked";

  const result = {} as Features;
  for (const f of FEATURES) {
    const base = REQUIRES[f];
    const baseState = base ? own(base) : "on";
    result[f] = baseState === "on" ? own(f) : own(f) === "hidden" ? "hidden" : baseState;
  }
  return result;
}

// The cheapest plan that includes a feature, for "Available on Growth".
export function planFor(feature: Feature): Plan {
  return (["starter", "growth", "pro"] as const).find((p) => PLAN_FEATURES[p].includes(feature)) ?? "pro";
}

export function planIncludes(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

// Which feature each embeddable widget belongs to ("chat" is the chat widget).
export const WIDGET_FEATURE = {
  chat: "web_chat",
  schedule: "bookings",
  appointment: "bookings",
  contact: "contact_form",
  registration: "registration",
} as const satisfies Record<string, Feature>;

// Owner-facing copy for the upgrade page and locked menu items.
export const FEATURE_INFO: Record<Feature, { title: string; pitch: string; points: string[] }> = {
  web_chat: {
    title: "Website chat",
    pitch: "An AI receptionist on your website that answers questions and captures leads, day and night.",
    points: ["Answers from your own knowledge base", "Takes names and numbers when visitors are interested", "Hands over to you when asked"],
  },
  contact_form: {
    title: "Contact form",
    pitch: "A contact form for your website, with every message in one inbox.",
    points: ["Drop-in form with your own fields", "Messages land in your dashboard inbox", "Records consent for follow-ups"],
  },
  whatsapp: {
    title: "WhatsApp",
    pitch: "Your AI receptionist on your WhatsApp number, so customers get answers where they already are.",
    points: ["Replies instantly, 24/7", "You can take over any chat", "Booking reminders and notices on WhatsApp"],
  },
  bookings: {
    title: "Online bookings",
    pitch: "Let customers book themselves: on your website, your own booking page, or by chatting with the AI.",
    points: ["Services, staff and opening hours", "Booking widgets and a hosted booking page", "Reminders, rescheduling and cancellation links"],
  },
  reviews: {
    title: "Review requests",
    pitch: "After each visit, customers are asked to rate you and leave a Google review.",
    points: ["Sent automatically the morning after", "Low scores alert you so you can follow up", "More Google reviews, with no extra work"],
  },
  registration: {
    title: "Registration form",
    pitch: "A sign-up form for your website that builds your customer list, with consent.",
    points: ["Collects names, emails and phone numbers", "Records marketing consent properly (POPIA)", "Customers get their own page to manage details"],
  },
};
