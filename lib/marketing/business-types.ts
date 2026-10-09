// Business types the marketing site speaks to. Drives the "Business type" menu
// now; each type's headline, problems, sample chat and feature list are added
// with the /for/[type] pages.

export type BusinessGroupSlug = "beauty" | "wellness" | "fitness" | "trades" | "clinics";

export type BusinessType = { slug: string; name: string };

export type BusinessGroup = {
  slug: BusinessGroupSlug;
  name: string;
  // Trades take callouts, not appointments, so their pages leave out booking
  // features (as the plan switches do for a plumber).
  bookings: boolean;
  types: BusinessType[];
};

export const BUSINESS_GROUPS: BusinessGroup[] = [
  {
    slug: "beauty",
    name: "Beauty",
    bookings: true,
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
    bookings: true,
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
    bookings: true,
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
    bookings: false,
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
    bookings: true,
    types: [
      { slug: "dental-practice", name: "Dental practice" },
      { slug: "optometrist", name: "Optometrist" },
      { slug: "vet", name: "Vet" },
      { slug: "consultants", name: "Consultants" },
    ],
  },
];
