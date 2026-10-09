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
    const menu = BUSINESS_GROUPS.map((g) => ({ slug: g.slug, name: g.name, bookings: g.bookings, types: g.types }));
    const pages = BUSINESS_PAGES.map((g) => ({
      slug: g.slug,
      name: g.name,
      bookings: g.bookings,
      types: g.types.map((t) => ({ slug: t.slug, name: t.name })),
    }));
    expect(pages).toEqual(menu);
  });

  it("uses each slug once across groups and types", () => {
    const slugs = BUSINESS_GROUPS.flatMap((g) => [g.slug, ...g.types.map((t) => t.slug)]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("never shows booking features or booking chats to trades", () => {
    const trades = BUSINESS_PAGES.find((g) => g.slug === "trades")!;
    expect(trades.bookings).toBe(false);
    expect(trades.highlights.some((h) => h.href.includes("fill-your-calendar"))).toBe(false);
    for (const t of trades.types) expect(t.chat.result.label).toBe("New lead");
  });

  it("offers the booked time in each sample chat", () => {
    for (const g of BUSINESS_PAGES.filter((g) => g.bookings)) {
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
