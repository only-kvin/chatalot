import { BUSINESS_GROUPS } from "@/lib/marketing/business-types";
import { PROFILE_SCHEMA_VERSION, siteProfileSchema, type SiteProfile } from "./profile";

// Builds the site profile from three sources, in priority order:
// 1. what the owner set up in ChatAlot (always wins),
// 2. the imported website (only with website_content consent; images only
//    with website_images consent),
// 3. the business type (page structure and imagery direction).
// Nothing is invented: anything not found is listed in `missing`, and where
// the website disagrees with the owner, the owner's value is kept and the
// disagreement is listed in `conflicts`. Pure, so the rules are testable.

export type OwnerData = {
  businessName: string;
  businessType: string | null;
  tone: string | null;
  handoffContact: string | null;
  primaryColor: string;
  whatsappLink: string | null;
  services: { name: string; description: string | null; category: string | null; durationMinutes: number | null; priceCents: number | null }[];
  // The business's own weekly hours (not individual staff hours).
  hours: { weekday: number; start: string; end: string }[];
  staff: { name: string; role: string | null; avatarUrl: string | null }[];
  // Typed knowledge items (source manual).
  knowledge: { type: string; title: string; content: string }[];
};

export type WebsiteData = { url: string | null; pages: { title: string; url: string; content: string }[] };

// What the model read out of the sources. Owner facts come only from the
// owner's own knowledge entries; website facts only from website text.
export type Extraction = {
  owner: { address: string | null; phone: string | null; email: string | null; hoursSummary: string | null; prices: { service: string; price: string }[] };
  website: {
    // False when the website text is plainly about a different business
    // (e.g. the wrong site in allowed domains): then none of it is used.
    sameBusiness: boolean;
    tagline: string | null;
    about: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    copyTone: string | null;
    faqs: { question: string; answer: string }[];
    prices: { service: string; price: string }[];
  };
};

export const EMPTY_EXTRACTION: Extraction = {
  owner: { address: null, phone: null, email: null, hoursSummary: null, prices: [] },
  website: { sameBusiness: true, tagline: null, about: null, address: null, phone: null, email: null, copyTone: null, faqs: [], prices: [] },
};

export type SiteImages = { logoUrl: string | null; imageUrls: string[]; themeColors: string[] };

export type Consents = { content: boolean; images: boolean };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const IMAGERY: Record<string, string> = {
  beauty: "Close-up, well-lit treatment and styling moments; calm salon interiors; natural skin tones.",
  wellness: "Soft natural light, calm treatment rooms, plants and textures; relaxed, unhurried people.",
  fitness: "Energetic training moments, real-looking gym and studio spaces, diverse bodies in motion.",
  trades: "Tradespeople at work, tools and finished jobs, South African homes; practical, trustworthy.",
  clinics: "Clean, bright consulting spaces and friendly, professional people; reassuring, not clinical.",
};

export function formatRand(cents: number): string {
  const rand = cents / 100;
  return `R${Number.isInteger(rand) ? rand.toLocaleString("en-ZA") : rand.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// "R 350.00", "R350", "350" → "350"
const priceKey = (s: string) => s.replace(/[^\d.,]/g, "").replace(/,/g, "").replace(/\.00$/, "");

function hm(t: string): string {
  return t.slice(0, 5);
}

export function buildProfile(input: {
  owner: OwnerData;
  website: WebsiteData | null;
  extraction: Extraction;
  images: SiteImages | null;
  consents: Consents;
}): SiteProfile {
  const { owner, consents } = input;
  // Without content consent nothing from the website is used, whatever was
  // passed; nor when the site turns out to be about another business.
  const otherBusiness = consents.content && Boolean(input.website?.pages.length) && !input.extraction.website.sameBusiness;
  const useSite = consents.content && !otherBusiness;
  const website = useSite ? input.website : null;
  const fromSite = useSite ? input.extraction.website : EMPTY_EXTRACTION.website;
  const fromOwner = input.extraction.owner;
  const images = consents.images && website ? input.images : null;

  const missing: string[] = [];
  const conflicts: SiteProfile["conflicts"] = [];
  if (otherBusiness) {
    conflicts.push({
      field: "website",
      ownerValue: owner.businessName,
      websiteValue: `${input.website?.url ?? "The imported website"} seems to describe a different business, so nothing from it was used`,
    });
  }

  // Contact: the owner's own entries first; the website fills gaps; a
  // disagreement keeps the owner's value and is recorded.
  const pick = (field: string, ownerValue: string | null, siteValue: string | null): string | null => {
    if (ownerValue && siteValue && norm(ownerValue) !== norm(siteValue)) {
      conflicts.push({ field, ownerValue, websiteValue: siteValue });
    }
    return ownerValue ?? siteValue ?? null;
  };
  const contact = {
    phone: pick("phone", fromOwner.phone, fromSite.phone),
    email: pick("email", fromOwner.email, fromSite.email),
    address: pick("address", fromOwner.address, fromSite.address),
    whatsappLink: owner.whatsappLink || null,
    handoff: owner.handoffContact || null,
  };

  // Hours from the dashboard; otherwise what the owner wrote in knowledge.
  const byDay = new Map<number, string[]>();
  for (const h of [...owner.hours].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))) {
    byDay.set(h.weekday, [...(byDay.get(h.weekday) ?? []), `${hm(h.start)}–${hm(h.end)}`]);
  }
  // Monday first.
  const hours = [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => byDay.has(d))
    .map((d) => ({ day: DAYS[d], times: byDay.get(d)!.join(", ") }));
  if (!hours.length && fromOwner.hoursSummary) hours.push({ day: "Hours", times: fromOwner.hoursSummary });

  // Services: the dashboard's services, or the owner's service entries if
  // there are none. Prices only from those, or from the owner's knowledge.
  const ownerPrice = (name: string) => fromOwner.prices.find((p) => norm(p.service) === norm(name))?.price ?? null;
  const sitePrice = (name: string) => fromSite.prices.find((p) => norm(p.service) === norm(name))?.price ?? null;
  const baseServices = owner.services.length
    ? owner.services
    : owner.knowledge
        .filter((k) => k.type === "service")
        .map((k) => ({ name: k.title, description: k.content, category: null, durationMinutes: null, priceCents: null }));
  const services = baseServices.map((s) => {
    const fromServices = s.priceCents !== null ? formatRand(s.priceCents) : null;
    const fromKnowledge = fromServices ? null : ownerPrice(s.name);
    const price = fromServices ?? fromKnowledge;
    const onSite = sitePrice(s.name);
    if (price && onSite && priceKey(price) !== priceKey(onSite)) {
      conflicts.push({ field: `price for ${s.name}`, ownerValue: price, websiteValue: onSite });
    }
    if (!price) missing.push(`price for ${s.name}`);
    return {
      name: s.name,
      description: s.description || null,
      category: s.category || null,
      durationMinutes: s.durationMinutes,
      price,
      priceSource: fromServices ? ("services" as const) : fromKnowledge ? ("owner_knowledge" as const) : null,
    };
  });

  const staff = owner.staff.map((p) => ({
    name: p.name,
    role: p.role || null,
    // Staff photos are images from the business: only with image consent.
    photoUrl: consents.images && p.avatarUrl ? p.avatarUrl : null,
  }));

  const ownerFaqs = owner.knowledge.filter((k) => k.type === "faq").map((k) => ({ question: k.title, answer: k.content, source: "owner" as const }));
  const asked = new Set(ownerFaqs.map((f) => norm(f.question)));
  const siteFaqs = fromSite.faqs
    .filter((f) => f.question.trim() && f.answer.trim() && !asked.has(norm(f.question)))
    .map((f) => ({ question: f.question, answer: f.answer, source: "website" as const }));

  const policies = owner.knowledge.filter((k) => k.type === "policy").map((k) => ({ title: k.title, text: k.content }));

  const typeLabel = BUSINESS_GROUPS.find((g) => g.slug === owner.businessType)?.name ?? null;
  const imagePolicy = consents.images ? ("own" as const) : ("ai_generated" as const);
  const imagery =
    (owner.businessType && IMAGERY[owner.businessType]) || "Bright, welcoming photos of the business's work and the people it serves.";

  const about = fromSite.about;
  if (!about) missing.push("about text");
  if (!contact.address) missing.push("address");
  if (!contact.phone && !contact.email) missing.push("phone number or email");
  if (!hours.length) missing.push("opening hours");
  if (!services.length) missing.push("list of services");
  if (consents.images && !images?.logoUrl) missing.push("logo");

  const profile: SiteProfile = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    business: {
      name: owner.businessName,
      type: owner.businessType,
      typeLabel,
      tagline: fromSite.tagline,
      about,
      tone: owner.tone || null,
    },
    contact,
    hours,
    services,
    staff,
    faqs: [...ownerFaqs, ...siteFaqs],
    policies,
    brand: {
      primaryColor: owner.primaryColor,
      extraColors: website ? (input.images?.themeColors ?? []) : [],
      logoUrl: images?.logoUrl ?? null,
      copyTone: fromSite.copyTone,
      imagery,
    },
    website: {
      url: website?.url ?? null,
      pages: (website?.pages ?? []).map((p) => ({ title: p.title, url: p.url })),
      imageUrls: images?.imageUrls ?? [],
    },
    imagePolicy,
    missing,
    conflicts,
  };
  return siteProfileSchema.parse(profile);
}
