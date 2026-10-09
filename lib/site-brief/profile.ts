import { z } from "zod";

// The site profile: everything we know about a business that a website
// needs, as validated data. Stored with each brief (site_briefs.profile)
// and returned by the export API, so its shape is versioned: change it →
// bump PROFILE_SCHEMA_VERSION and document the change in docs/SETUP.md.

export const PROFILE_SCHEMA_VERSION = 1;

const text = z.string().trim().min(1);
const maybe = text.nullable();

export const siteProfileSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  business: z.object({
    name: text,
    // A business-type group slug (beauty, trades…), "other", or null.
    type: z.string().nullable(),
    typeLabel: z.string().nullable(),
    tagline: maybe,
    about: maybe,
    tone: maybe,
  }),
  contact: z.object({
    phone: maybe,
    email: maybe,
    address: maybe,
    whatsappLink: maybe,
    handoff: maybe,
  }),
  // Opening hours, one line per open day ("Monday", "09:00–17:00"), or a
  // single owner-written summary when no hours are set in the dashboard.
  hours: z.array(z.object({ day: z.string(), times: text })),
  services: z.array(
    z.object({
      name: text,
      description: maybe,
      category: maybe,
      durationMinutes: z.number().int().positive().nullable(),
      // As shown to customers, e.g. "R350". Only ever from the business's
      // services or its own knowledge entries, never the website or a guess.
      price: maybe,
      priceSource: z.enum(["services", "owner_knowledge"]).nullable(),
    }),
  ),
  staff: z.array(z.object({ name: text, role: maybe, photoUrl: z.url().nullable() })),
  faqs: z.array(z.object({ question: text, answer: text, source: z.enum(["owner", "website"]) })),
  policies: z.array(z.object({ title: text, text })),
  brand: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    extraColors: z.array(z.string()),
    logoUrl: z.url().nullable(),
    // How the business's own copy reads (from its website), e.g. "warm, informal".
    copyTone: maybe,
    imagery: text,
  }),
  website: z.object({
    url: z.url().nullable(),
    pages: z.array(z.object({ title: text, url: z.url() })),
    imageUrls: z.array(z.url()),
  }),
  imagePolicy: z.enum(["own", "ai_generated"]),
  // What a builder still needs to ask the client for.
  missing: z.array(z.string()),
  // Where the website disagrees with what the owner set up (owner kept).
  conflicts: z.array(z.object({ field: z.string(), ownerValue: z.string(), websiteValue: z.string() })),
});

export type SiteProfile = z.infer<typeof siteProfileSchema>;
