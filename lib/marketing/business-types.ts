// The business types the marketing site speaks to: names and slugs only,
// for the menus and the demo form. Each one's page content (headline,
// problems, sample chat) lives in business-pages.ts.

export type BusinessGroupSlug = "beauty" | "wellness" | "fitness" | "trades" | "clinics";

export type BusinessType = { slug: string; name: string };

export type BusinessGroup = {
  slug: BusinessGroupSlug;
  name: string;
  // How the group books: appointments at the business, or call-outs to the
  // customer's address (trades).
  kind: "appointments" | "callouts";
  types: BusinessType[];
};

export const BUSINESS_GROUPS: BusinessGroup[] = [
  {
    slug: "beauty",
    name: "Beauty",
    kind: "appointments",
    types: [
      { slug: "hair-salon", name: "Hair salon" },
      { slug: "barbershop", name: "Barbershop" },
      { slug: "nail-salon", name: "Nail salon" },
      { slug: "lash-salon", name: "Lash salon" },
      { slug: "hair-removal", name: "Hair removal" },
    ],
  },
  {
    slug: "wellness",
    name: "Wellness",
    kind: "appointments",
    types: [
      { slug: "day-spa", name: "Day spa" },
      { slug: "hotel-spa", name: "Hotel spa" },
      { slug: "massage", name: "Massage" },
      { slug: "med-spa", name: "Med spa" },
      { slug: "physiotherapy", name: "Physiotherapy" },
      { slug: "chiropractic", name: "Chiropractic" },
      { slug: "wellness-centre", name: "Wellness centre" },
    ],
  },
  {
    slug: "fitness",
    name: "Fitness",
    kind: "appointments",
    types: [
      { slug: "gym", name: "Gym" },
      { slug: "personal-training", name: "Personal training" },
      { slug: "yoga", name: "Yoga" },
      { slug: "pilates", name: "Pilates" },
      { slug: "group-training", name: "Group training" },
      { slug: "martial-arts", name: "Martial arts" },
      { slug: "dance-studio", name: "Dance studio" },
      { slug: "sports-facility", name: "Sports facility" },
    ],
  },
  {
    slug: "trades",
    name: "Trades and home services",
    kind: "callouts",
    types: [
      { slug: "plumbers", name: "Plumbers" },
      { slug: "electricians", name: "Electricians" },
      { slug: "handymen", name: "Handymen" },
      { slug: "cleaners", name: "Cleaners" },
      { slug: "pest-control", name: "Pest control" },
    ],
  },
  {
    slug: "clinics",
    name: "Clinics and professional services",
    kind: "appointments",
    types: [
      { slug: "dental-practice", name: "Dental practice" },
      { slug: "optometrist", name: "Optometrist" },
      { slug: "vet", name: "Vet" },
      { slug: "consultants", name: "Consultants" },
    ],
  },
];

// Choices for "Type of business" on the demo form.
export const BUSINESS_TYPE_OPTIONS: { value: string; label: string }[] = [
  ...BUSINESS_GROUPS.map((g) => ({ value: g.slug, label: g.name })),
  { value: "other", label: "Something else" },
];
