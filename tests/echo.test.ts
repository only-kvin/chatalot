import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NAV_GROUPS } from "../app/(dashboard)/dashboard/nav-items";
import { GUIDE_PAGES, allowedHrefs, guideText, pageForPath, pagesFor } from "../lib/echo/guide";
import { ECHO_RULES, buildEchoPrompt, setupProgressText } from "../lib/echo/prompt";
import { parseEchoToolInput, safeDashboardLink } from "../lib/echo/tools";
import { cleanReply } from "../lib/echo/reply";
import type { Features } from "../lib/plans";

const ALL_ON: Features = { web_chat: "on", contact_form: "on", whatsapp: "on", bookings: "on", reviews: "on", registration: "on" };
const STARTER: Features = { ...ALL_ON, whatsapp: "locked", bookings: "locked", reviews: "locked", registration: "locked" };

describe("Echo's dashboard guide", () => {
  it("covers exactly the pages in the sidebar, with the same plan gating", () => {
    const nav = NAV_GROUPS.flatMap((g) => g.items).map((i) => ({ href: i.href, feature: i.feature }));
    const guide = GUIDE_PAGES.map((p) => ({ href: p.href, feature: p.feature }));
    expect(guide).toEqual(nav);
  });

  it("finds the section for detail pages, and the Overview only at its own path", () => {
    expect(pageForPath("/dashboard/bookings/123")?.title).toBe("Bookings");
    expect(pageForPath("/dashboard")?.title).toBe("Overview");
    expect(pageForPath("/dashboard/upgrade/bookings")).toBeNull();
  });

  it("leaves hidden features out entirely and offers upgrades for locked ones", () => {
    const hidden: Features = { ...STARTER, bookings: "hidden" };
    expect(pagesFor(hidden).locked).toHaveLength(0);
    expect(guideText(hidden)).not.toContain("Online bookings");

    const text = guideText(STARTER);
    expect(text).not.toContain("## Services");
    expect(text).toContain("Online bookings");
    expect(text).toContain("/dashboard/upgrade/bookings");
    // Features with no page of their own are covered too.
    expect(text).toContain("Review requests");
    expect(text).toContain("/dashboard/upgrade/reviews");
    expect(allowedHrefs(STARTER).has("/dashboard/upgrade/reviews")).toBe(true);
  });
});

describe("safeDashboardLink", () => {
  const allowed = allowedHrefs(STARTER);

  it("allows the business's pages with a simple tab or section", () => {
    expect(safeDashboardLink("/dashboard/knowledge", allowed)).toBe("/dashboard/knowledge");
    expect(safeDashboardLink("/dashboard/widget?tab=chat", allowed)).toBe("/dashboard/widget?tab=chat");
    expect(safeDashboardLink("/dashboard/settings#bookings", allowed)).toBe("/dashboard/settings#bookings");
    expect(safeDashboardLink("/dashboard/upgrade/bookings", allowed)).toBe("/dashboard/upgrade/bookings");
  });

  it("refuses other sites, locked pages, unknown pages and anything clever", () => {
    for (const path of [
      "https://evil.example/dashboard",
      "//evil.example",
      "/dashboard/services",
      "/dashboard/nope",
      "/dashboard/../admin",
      "/admin",
      "/dashboard/widget?tab=chat&next=https://evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeDashboardLink(path, allowed), path).toBeNull();
    }
  });
});

describe("parseEchoToolInput", () => {
  it("accepts valid calls and rejects unknown tools and bad input", () => {
    expect(parseEchoToolInput({ name: "show_page", input: { path: "/dashboard", label: "Open Overview" } }).ok).toBe(true);
    expect(parseEchoToolInput({ name: "get_setup_progress", input: {} }).ok).toBe(false);
    expect(parseEchoToolInput({ name: "toString", input: {} })).toEqual({ ok: false, error: "Unknown tool: toString" });
    expect(parseEchoToolInput({ name: "show_page", input: { path: "/dashboard" } }).ok).toBe(false);
    expect(parseEchoToolInput({ name: "show_page", input: undefined }).ok).toBe(false);
  });
});

describe("buildEchoPrompt", () => {
  it("puts the persona, then the rules, then the owner's page, setup and the fenced guide", () => {
    const prompt = buildEchoPrompt({
      businessName: "Demo Salon",
      currentPage: pageForPath("/dashboard/services"),
      pathname: "/dashboard/services",
      setup: "SETUP TEXT",
      guide: "GUIDE TEXT",
    });
    const persona = prompt.indexOf("You are Echo");
    const rules = prompt.indexOf(ECHO_RULES);
    const page = prompt.indexOf("They're on: Services (/dashboard/services)");
    const setup = prompt.indexOf("<setup_progress>\nSETUP TEXT\n</setup_progress>");
    const guide = prompt.indexOf("<dashboard_guide>\nGUIDE TEXT\n</dashboard_guide>");
    expect(persona).toBe(0);
    expect(rules).toBeGreaterThan(persona);
    expect(page).toBeGreaterThan(rules);
    expect(setup).toBeGreaterThan(page);
    expect(guide).toBeGreaterThan(setup);
    expect(prompt).toContain("<business_name>Demo Salon</business_name>");
  });

  it("says when the page isn't in the guide", () => {
    const prompt = buildEchoPrompt({ businessName: "", currentPage: null, pathname: "/dashboard/upgrade/bookings", setup: "", guide: "" });
    expect(prompt).toContain("a page that isn't in the guide (/dashboard/upgrade/bookings)");
  });
});

describe("setupProgressText", () => {
  it("reports each step's real state", () => {
    const text = setupProgressText([
      { title: "Add your knowledge", text: "t", href: "/dashboard/knowledge", done: true },
      { title: "Install the widget", text: "t", href: "/dashboard/settings", done: false },
    ]);
    expect(text).toContain("1 of 2 setup steps still to do.");
    expect(text).toContain("[done] Add your knowledge");
    expect(text).toContain("[to do] Install the widget");
  });
});

describe("cleanReply", () => {
  const allowed = allowedHrefs(STARTER);

  it("turns written links and made-up buttons into real buttons", () => {
    const reply = cleanReply(
      'Start with **Knowledge**.\n\n[Open Knowledge](/dashboard/knowledge)\n\n<button label="Open Widgets" path="/dashboard/widget?tab=chat" />',
      allowed,
    );
    expect(reply.text).toBe("Start with Knowledge.");
    expect(cleanReply("Add one.\n\n[Open Knowledge]\n", allowed).text).toBe("Add one.");
    expect(cleanReply("Start on the Knowledge page.  (Open Add Knowledge)", allowed).text).toBe("Start on the Knowledge page.");
    // Ordinary brackets mid-sentence stay.
    expect(cleanReply("Set a price (optional) for each.", allowed).text).toBe("Set a price (optional) for each.");
    expect(reply.links).toEqual([
      { href: "/dashboard/knowledge", label: "Open Knowledge" },
      { href: "/dashboard/widget?tab=chat", label: "Open Widgets" },
    ]);
  });

  it("keeps only the words of links it can't allow", () => {
    const reply = cleanReply("Try [this page](https://evil.example) or [Services](/dashboard/services).", allowed);
    expect(reply.text).toBe("Try this page or Services.");
    expect(reply.links).toEqual([]);
  });
});

// The engine with the model replaced: the "model" calls whatever tools the
// test scripts and replies with scripted text; the test checks what reaches
// the owner.
const scripted = vi.hoisted(() => ({
  calls: [] as { name: string; input: unknown }[],
  results: [] as string[],
  reply: "Here you go.",
  system: "",
}));
vi.mock("../lib/agent/model", () => ({
  runAgentTurn: async function* (params: { system: string; executeTool: (c: { name: string; input: unknown }) => Promise<string> }) {
    scripted.system = params.system;
    for (const call of scripted.calls) scripted.results.push(await params.executeTool(call));
    yield { type: "text-delta", text: scripted.reply };
  },
}));
const setupSteps = vi.hoisted(() => vi.fn());
vi.mock("../lib/onboarding", () => ({ loadSetupSteps: setupSteps }));

describe("runEcho", () => {
  beforeEach(() => {
    scripted.calls = [];
    scripted.results = [];
    scripted.reply = "Here you go.";
    setupSteps.mockReset();
    setupSteps.mockResolvedValue([]);
  });

  async function run(features: Features) {
    const { runEcho } = await import("../lib/echo/engine");
    const events = [];
    for await (const e of runEcho({
      supabase: {} as SupabaseClient,
      tenantId: "tenant-1",
      businessName: "Demo Salon",
      features,
      pathname: "/dashboard",
      messages: [{ role: "user", content: "help" }],
      signal: new AbortController().signal,
    })) {
      events.push(e);
    }
    return events;
  }

  it("only turns allowed pages into buttons, after the reply text", async () => {
    scripted.calls = [
      { name: "show_page", input: { path: "/dashboard/knowledge", label: "Open Knowledge" } },
      { name: "show_page", input: { path: "https://evil.example", label: "Click me" } },
      { name: "show_page", input: { path: "/dashboard/services", label: "Open Services" } },
    ];
    const events = await run(STARTER);
    expect(events).toEqual([
      { type: "text", text: "Here you go." },
      { type: "link", href: "/dashboard/knowledge", label: "Open Knowledge" },
    ]);
    expect(scripted.results[1]).toContain("isn't a page this business can open");
  });

  it("gives the model this tenant's real setup progress, with the business's bookings setting", async () => {
    setupSteps.mockResolvedValue([{ title: "Set your hours", text: "t", href: "/dashboard/availability", done: false }]);
    await run(STARTER);
    expect(setupSteps).toHaveBeenCalledWith(expect.anything(), "tenant-1", false);
    expect(scripted.system).toContain("[to do] Set your hours");
  });

  it("cleans the reply and doesn't repeat a button the tool already gave", async () => {
    scripted.calls = [{ name: "show_page", input: { path: "/dashboard/knowledge", label: "Open Knowledge" } }];
    scripted.reply = "Add **one FAQ** first. [Knowledge](/dashboard/knowledge)";
    const events = await run(ALL_ON);
    expect(events).toEqual([
      { type: "text", text: "Add one FAQ first." },
      { type: "link", href: "/dashboard/knowledge", label: "Open Knowledge" },
    ]);
  });

  it("gives no button to the page they're already on", async () => {
    scripted.calls = [{ name: "show_page", input: { path: "/dashboard", label: "Open Overview" } }];
    const events = await run(ALL_ON);
    expect(events).toEqual([{ type: "text", text: "Here you go." }]);
    expect(scripted.results[0]).toContain("already on that page");
  });

  it("hands validation errors back to the model instead of running the tool", async () => {
    scripted.calls = [{ name: "show_page", input: { label: "No path" } }];
    const events = await run(ALL_ON);
    expect(events).toEqual([{ type: "text", text: "Here you go." }]);
    expect(scripted.results[0]).toMatch(/^Invalid input for show_page/);
  });
});