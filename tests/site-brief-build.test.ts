import { describe, expect, it } from "vitest";
import { buildProfile, EMPTY_EXTRACTION, type Extraction, type OwnerData, type WebsiteData } from "../lib/site-brief/build";
import { readSiteImages } from "../lib/site-brief/images";
import { PROFILE_SCHEMA_VERSION, siteProfileSchema } from "../lib/site-brief/profile";
import { renderLovablePrompt } from "../lib/site-brief/prompt";
import { widgetSnippets } from "../lib/site-brief/widgets";
import { resolveFeatures } from "../lib/plans";

// The site profile's rules, without a database or a model.

const owner: OwnerData = {
  businessName: "Glow Studio",
  businessType: "beauty",
  tone: "warm and friendly",
  handoffContact: "021 555 0134",
  primaryColor: "#be185d",
  whatsappLink: null,
  services: [
    { name: "Gel manicure", description: "Long-lasting gel colour.", category: "Nails", durationMinutes: 45, priceCents: 35000 },
    { name: "Pedicure", description: null, category: "Nails", durationMinutes: 60, priceCents: null },
  ],
  hours: [
    { weekday: 6, start: "09:00:00", end: "14:00:00" },
    { weekday: 2, start: "09:00:00", end: "18:00:00" },
  ],
  staff: [{ name: "Thandi", role: "Nail technician", avatarUrl: "https://cdn.example/thandi.jpg" }],
  knowledge: [
    { type: "faq", title: "Do you take walk-ins?", content: "Yes, when there's a gap." },
    { type: "policy", title: "Cancellations", content: "4 hours' notice please." },
    { type: "info", title: "Address", content: "12 Main Road, Sea Point" },
  ],
};

const website: WebsiteData = {
  url: "https://glow.example/",
  pages: [{ title: "Home", url: "https://glow.example/", content: "Welcome to Glow" }],
};

const extraction: Extraction = {
  owner: { address: "12 Main Road, Sea Point", phone: "021 555 0134", email: null, hoursSummary: null, prices: [] },
  website: {
    sameBusiness: true,
    tagline: "Nails, done beautifully",
    about: "Glow is a small nail studio in Sea Point.",
    address: "14 Main Road, Sea Point",
    phone: "021 555 0134",
    email: "hello@glow.example",
    copyTone: "warm, informal",
    faqs: [
      { question: "Do you take walk-ins?", answer: "Sometimes." },
      { question: "Is there parking?", answer: "Street parking outside." },
    ],
    prices: [{ service: "Gel manicure", price: "R399" }],
  },
};

const images = { logoUrl: "https://glow.example/logo.png", imageUrls: ["https://glow.example/salon.jpg"], themeColors: ["#be185d"] };

const build = (consents: { content: boolean; images: boolean }, overrides: Partial<Parameters<typeof buildProfile>[0]> = {}) =>
  buildProfile({ owner, website, extraction, images, consents, ...overrides });

describe("buildProfile", () => {
  it("keeps the owner's data over the website's and records each conflict", () => {
    const p = build({ content: true, images: false });
    expect(p.contact.address).toBe("12 Main Road, Sea Point");
    expect(p.services[0]).toMatchObject({ name: "Gel manicure", price: "R350", priceSource: "services" });
    expect(p.conflicts).toEqual(
      expect.arrayContaining([
        { field: "address", ownerValue: "12 Main Road, Sea Point", websiteValue: "14 Main Road, Sea Point" },
        { field: "price for Gel manicure", ownerValue: "R350", websiteValue: "R399" },
      ]),
    );
    // The website fills gaps the owner left: email, about, extra FAQs.
    expect(p.contact.email).toBe("hello@glow.example");
    expect(p.business.about).toBe("Glow is a small nail studio in Sea Point.");
    expect(p.faqs.map((f) => f.question)).toEqual(["Do you take walk-ins?", "Is there parking?"]);
  });

  it("never invents a price: a missing one is a gap, and website prices aren't used", () => {
    const p = build({ content: true, images: false });
    expect(p.services[1]).toMatchObject({ name: "Pedicure", price: null, priceSource: null });
    expect(p.missing).toContain("price for Pedicure");
    const withSitePrice = build({ content: true, images: false }, { extraction: { ...extraction, website: { ...extraction.website, prices: [{ service: "Pedicure", price: "R250" }] } } });
    expect(withSitePrice.services[1].price).toBeNull();
  });

  it("uses a price the owner typed into their knowledge", () => {
    const p = build({ content: true, images: false }, { extraction: { ...extraction, owner: { ...extraction.owner, prices: [{ service: "pedicure", price: "R280" }] } } });
    expect(p.services[1]).toMatchObject({ price: "R280", priceSource: "owner_knowledge" });
    expect(p.missing).not.toContain("price for Pedicure");
  });

  it("uses nothing from the website without content consent", () => {
    const p = build({ content: false, images: true });
    expect(p.website).toEqual({ url: null, pages: [], imageUrls: [] });
    expect(p.business.about).toBeNull();
    expect(p.business.tagline).toBeNull();
    expect(p.contact.email).toBeNull();
    expect(p.faqs.every((f) => f.source === "owner")).toBe(true);
    expect(p.conflicts).toEqual([]);
    expect(p.brand.logoUrl).toBeNull();
  });

  it("uses no site images or staff photos without image consent", () => {
    const p = build({ content: true, images: false });
    expect(p.imagePolicy).toBe("ai_generated");
    expect(p.website.imageUrls).toEqual([]);
    expect(p.brand.logoUrl).toBeNull();
    expect(p.staff[0].photoUrl).toBeNull();

    const withImages = build({ content: true, images: true });
    expect(withImages.imagePolicy).toBe("own");
    expect(withImages.website.imageUrls).toEqual(["https://glow.example/salon.jpg"]);
    expect(withImages.staff[0].photoUrl).toBe("https://cdn.example/thandi.jpg");
  });

  it("ignores a website that describes a different business, and says so", () => {
    const p = build({ content: true, images: true }, { extraction: { ...extraction, website: { ...extraction.website, sameBusiness: false } } });
    expect(p.business.about).toBeNull();
    expect(p.website.url).toBeNull();
    expect(p.website.imageUrls).toEqual([]);
    expect(p.faqs.every((f) => f.source === "owner")).toBe(true);
    expect(p.conflicts[0]).toMatchObject({ field: "website", ownerValue: "Glow Studio" });
  });

  it("formats hours Monday first", () => {
    expect(build({ content: false, images: false }).hours).toEqual([
      { day: "Tuesday", times: "09:00–18:00" },
      { day: "Saturday", times: "09:00–14:00" },
    ]);
  });

  it("builds a complete profile with no website at all", () => {
    const p = buildProfile({ owner, website: null, extraction: EMPTY_EXTRACTION, images: null, consents: { content: false, images: false } });
    expect(siteProfileSchema.safeParse(p).success).toBe(true);
    expect(p.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(p.services).toHaveLength(2);
    expect(p.missing).toEqual(expect.arrayContaining(["about text", "address", "price for Pedicure"]));
  });
});

describe("renderLovablePrompt", () => {
  const features = resolveFeatures("growth", {});
  const snippets = widgetSnippets("pk-test-key", features);

  it("uses only the profile's prices, says 'price on request' for gaps, and lists the gaps", () => {
    const prompt = renderLovablePrompt(build({ content: true, images: false }), snippets);
    expect(prompt).toContain("**Gel manicure** (R350, 45 min)");
    expect(prompt).toContain("**Pedicure** (price on request, 60 min)");
    expect(prompt).not.toContain("R399");
    expect(prompt).toContain("## Gaps to fill");
    expect(prompt).toContain("- price for Pedicure");
  });

  it("asks for AI or royalty-free images without image consent, and puts no site image URLs in", () => {
    const prompt = renderLovablePrompt(build({ content: true, images: false }), snippets);
    expect(prompt).toContain("Use AI-generated or royalty-free images");
    expect(prompt).not.toContain("glow.example/salon.jpg");
    expect(prompt).not.toContain("logo.png");
    expect(prompt).not.toContain("thandi.jpg");
  });

  it("forbids invented reviews and claims", () => {
    expect(renderLovablePrompt(build({ content: false, images: false }), snippets)).toContain(
      "No invented reviews, testimonials, ratings, statistics, awards or client logos",
    );
  });
});

describe("widgetSnippets", () => {
  it("includes only the widgets the plan has on, with the business's key", () => {
    const starter = widgetSnippets("pk-starter", resolveFeatures("starter", {}));
    const codes = starter.map((s) => s.code).join("\n");
    expect(codes).toContain('data-key="pk-starter"');
    expect(codes).toContain('data-chatalot="contact"');
    expect(codes).not.toContain('data-chatalot="appointment"');
    expect(codes).not.toContain('data-chatalot="registration"');

    const pro = widgetSnippets("pk-pro", resolveFeatures("pro", {})).map((s) => s.code).join("\n");
    expect(pro).toContain('data-chatalot="appointment"');
    expect(pro).toContain('data-chatalot="registration"');

    // Trades with bookings switched off: no booking widgets.
    const trades = widgetSnippets("pk-trade", resolveFeatures("pro", { bookings: "off" })).map((s) => s.code).join("\n");
    expect(trades).not.toContain('data-chatalot="appointment"');
  });
});

describe("readSiteImages", () => {
  it("finds the logo, photos and theme colour, skipping icons and tiny images", () => {
    const html = `<html><head><meta property="og:image" content="/og.jpg"><meta name="theme-color" content="#be185d"></head><body>
      <img src="/assets/logo.svg" alt="Glow logo"><img src="/team.jpg" width="600"><img src="/icon-star.png"><img src="/tiny.png" width="16"></body></html>`;
    expect(readSiteImages(html, "https://glow.example/")).toEqual({
      logoUrl: "https://glow.example/assets/logo.svg",
      imageUrls: ["https://glow.example/og.jpg", "https://glow.example/team.jpg"],
      themeColors: ["#be185d"],
    });
  });
});
