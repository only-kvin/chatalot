import type { Feature } from "@/lib/plans";

// Self-serve sign-up (/signup) arrives in a later phase. Until then "Start
// free trial" buttons are left out and "Get a demo" is the way in.
export const SIGNUP_OPEN = false;

// The public key of the platform's own "ChatAlot" tenant: its chat widget
// runs on the marketing site, and /demo requests are filed as its leads.
// Unset (e.g. a fresh local checkout) means no widget and no demo filing.
export const MARKETING_WIDGET_KEY = process.env.NEXT_PUBLIC_MARKETING_WIDGET_KEY || null;

// How each plan feature is described to buyers.
export const FEATURE_PITCH: Record<Feature, string> = {
  web_chat: "AI receptionist on your website",
  contact_form: "Contact form widget",
  whatsapp: "AI replies on WhatsApp",
  bookings: "Online booking, booking links and reminders",
  reviews: "Review requests and low-score alerts",
  registration: "Customer registration widget",
};
