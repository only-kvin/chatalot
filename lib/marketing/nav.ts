import { BUSINESS_GROUPS } from "./business-types";

// Menu content for the marketing header and footer. Features list only what
// the app does today; don't add anything that isn't built.

export type NavLink = { label: string; href: string; description?: string };
export type NavGroup = { title: string; href?: string; links: NavLink[] };

export const FEATURE_GROUPS: NavGroup[] = [
  {
    title: "Never miss a customer",
    href: "/features/never-miss-a-customer",
    links: [
      { label: "AI receptionist on your website", href: "/features/never-miss-a-customer#website-chat" },
      { label: "WhatsApp replies", href: "/features/never-miss-a-customer#whatsapp" },
      { label: "Human takeover when it matters", href: "/features/never-miss-a-customer#takeover" },
    ],
  },
  {
    title: "Fill your calendar",
    href: "/features/fill-your-calendar",
    links: [
      { label: "Online booking with staff, services and hours", href: "/features/fill-your-calendar#booking" },
      { label: "Booking links the AI sends", href: "/features/fill-your-calendar#booking-links" },
      { label: "Reminders that cut no-shows", href: "/features/fill-your-calendar#reminders" },
      { label: "Rescheduling by link", href: "/features/fill-your-calendar#rescheduling" },
    ],
  },
  {
    title: "Grow and keep clients",
    href: "/features/grow-and-keep-clients",
    links: [
      { label: "Lead capture with owner alerts", href: "/features/grow-and-keep-clients#leads" },
      { label: "Review requests and low-score alerts", href: "/features/grow-and-keep-clients#reviews" },
      { label: "Customer records with POPIA consent history", href: "/features/grow-and-keep-clients#customers" },
      { label: "Daily summary for the owner", href: "/features/grow-and-keep-clients#daily-summary" },
    ],
  },
  {
    title: "Your website, upgraded",
    href: "/features/your-website-upgraded",
    links: [
      { label: "Branded widgets: schedule, appointment, contact, registration", href: "/features/your-website-upgraded#widgets" },
      { label: "Hosted booking page", href: "/features/your-website-upgraded#booking-page" },
      { label: "One-line install", href: "/features/your-website-upgraded#install" },
    ],
  },
];

export const BUSINESS_TYPE_GROUPS: NavGroup[] = BUSINESS_GROUPS.map((g) => ({
  title: g.name,
  href: `/for/${g.slug}`,
  links: [
    ...g.types.map((t) => ({ label: t.name, href: `/for/${t.slug}` })),
    { label: `All ${g.name.toLowerCase()}`, href: `/for/${g.slug}` },
  ],
}));

export const RESOURCE_LINKS: NavLink[] = [
  { label: "Getting started guide", href: "/resources/getting-started", description: "From sign-up to your first answered chat." },
  { label: "Installing the widget", href: "/resources/install-widget", description: "One line of code on any website." },
  { label: "Connecting WhatsApp", href: "/resources/connect-whatsapp", description: "Put the AI on your business number." },
  { label: "FAQ", href: "/resources#faq", description: "Straight answers to common questions." },
  { label: "Watch the demo", href: "/resources#demo", description: "See it working in under a minute." },
  { label: "Privacy and POPIA", href: "/privacy", description: "How customer information is handled." },
];

export const FOOTER_COLUMNS: NavGroup[] = [
  {
    title: "Product",
    links: [
      ...FEATURE_GROUPS.map((g) => ({ label: g.title, href: g.href ?? "/features" })),
      { label: "Pricing", href: "/pricing" },
      { label: "Get a demo", href: "/demo" },
    ],
  },
  {
    title: "Business types",
    links: BUSINESS_GROUPS.map((g) => ({ label: g.name, href: `/for/${g.slug}` })),
  },
  {
    title: "Resources",
    links: RESOURCE_LINKS.filter((l) => l.href !== "/privacy"),
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Data deletion", href: "/data-deletion" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];
