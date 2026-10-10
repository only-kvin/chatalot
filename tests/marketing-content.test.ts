import { describe, expect, it } from "vitest";
import { publicPaths } from "../lib/marketing/paths";
import { BUSINESS_PAGES } from "../lib/marketing/business-pages";
import { BUSINESS_GROUPS } from "../lib/marketing/business-types";
import { FEATURE_PAGES } from "../lib/marketing/features";
import { BUSINESS_TYPE_GROUPS, FEATURE_GROUPS, FOOTER_COLUMNS, RESOURCE_LINKS } from "../lib/marketing/nav";

// The marketing site's content lives in a few data files; these checks keep
// them in step, and make sure no menu link points at a page that doesn't exist.

describe("business type content", () => {
  it("has page content for exactly the types in the menu, with the same names", () => {
    const menu = BUSINESS_GROUPS.map((g) => ({ slug: g.slug, name: g.name, kind: g.kind, types: g.types }));
    const pages = BUSINESS_PAGES.map((g) => ({
      slug: g.slug,
      name: g.name,
      kind: g.kind,
      types: g.types.map((t) => ({ slug: t.slug, name: t.name })),
    }));
    expect(pages).toEqual(menu);
  });

  it("uses each slug once across groups and types", () => {
    const slugs = BUSINESS_GROUPS.flatMap((g) => [g.slug, ...g.types.map((t) => t.slug)]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("shows trades call-out features, not salon-style appointments", () => {
    const trades = BUSINESS_PAGES.find((g) => g.slug === "trades")!;
    expect(trades.kind).toBe("callouts");
    const titles = trades.highlights.map((h) => h.title).join(" | ");
    for (const feature of ["Request a call-out", "Arrival windows", "Call-out fee shown upfront", "Your service areas", "Urgent jobs"]) {
      expect(titles).toContain(feature);
    }
    // Nothing that only appointment businesses get (staff choice, reviews).
    expect(trades.highlights.some((h) => h.href.includes("#reviews") || h.href.includes("#reminders"))).toBe(false);
    for (const t of trades.types) expect(["New lead", "Call-out request"]).toContain(t.chat.result.label);
  });

  it("ends the plumber chat in a call-out request with the window and fee", () => {
    const plumbers = BUSINESS_PAGES.find((g) => g.slug === "trades")!.types.find((t) => t.slug === "plumbers")!;
    expect(plumbers.chat.result.label).toBe("Call-out request");
    const [start, end] = plumbers.chat.result.time.split("–");
    const answer = plumbers.chat.messages.find((m) => m.from === "ai")!.text;
    expect(answer).toContain(`between ${start} and ${end}`);
    expect(answer).toMatch(/call-out fee is R\d+/);
    expect(plumbers.chat.messages.at(-1)!.text).toContain("Call-out requested");
  });

  it("mentions mobile services for beauty and wellness", () => {
    for (const slug of ["beauty", "wellness"]) {
      const intro = BUSINESS_PAGES.find((g) => g.slug === slug)!.intro;
      expect(intro, slug).toMatch(/come to them|place or theirs/);
    }
  });

  it("offers the booked time in each sample chat", () => {
    for (const g of BUSINESS_PAGES.filter((g) => g.kind === "appointments")) {
      for (const t of g.types) {
        const answer = t.chat.messages.find((m) => m.from === "ai")!.text;
        expect(answer, t.slug).toContain(t.chat.result.time);
      }
    }
  });
});

describe("menu links", () => {
  const paths = new Set(publicPaths());
  const anchors = new Set(FEATURE_PAGES.flatMap((p) => p.sections.map((s) => `/features/${p.slug}#${s.id}`)));
  const resourceAnchors = new Set(["/resources#faq", "/resources#demo", "/resources#guides", "/resources#privacy"]);

  const allLinks = [
    ...FEATURE_GROUPS.flatMap((g) => [g.href!, ...g.links.map((l) => l.href)]),
    ...BUSINESS_TYPE_GROUPS.flatMap((g) => [g.href!, ...g.links.map((l) => l.href)]),
    ...RESOURCE_LINKS.map((l) => l.href),
    ...FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href)),
    ...BUSINESS_PAGES.flatMap((g) => g.highlights.map((h) => h.href)),
  ];

  it.each(allLinks)("%s exists", (href) => {
    expect(paths.has(href) || anchors.has(href) || resourceAnchors.has(href)).toBe(true);
  });
});
