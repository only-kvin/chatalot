import { BUSINESS_GROUPS } from "./business-types";
import { FEATURE_PAGES } from "./features";

// Menu content for the marketing header and footer. Features list only what
// the app does today; don't add anything that isn't built.

export type NavLink = { label: string; href: string; description?: string };
export type NavGroup = { title: string; href?: string; links: NavLink[] };

export const FEATURE_GROUPS: NavGroup[] = FEATURE_PAGES.map((p) => ({
  title: p.title,
  href: `/features/${p.slug}`,
  links: p.sections.map((sec) => ({ label: sec.label, href: `/features/${p.slug}#${sec.id}` })),
}));

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
