import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NAV_GROUPS } from "../app/(dashboard)/dashboard/nav-items";
import { GUIDE_PAGES, allowedHrefs, guideText, pageForPath, pagesFor } from "../lib/echo/guide";
import { ECHO_RULES, buildEchoPrompt, setupProgressText } from "../lib/echo/prompt";
import { parseEchoToolInput, safeDashboardLink } from "../lib/echo/tools";
import { cleanReply } from "../lib/echo/reply";
import { TARGETS, onPage, planTour, targetsFor } from "../lib/echo/targets";
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

// Every file of the dashboard's UI, to check the cursor's targets against.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith(".tsx") ? [full] : [];
  });
}
const UI_SOURCE = [...sourceFiles(path.join(__dirname, "../app/(dashboard)")), ...sourceFiles(path.join(__dirname, "../components"))]
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("Echo's cursor targets", () => {
  it("each point at something that exists in the dashboard's code", () => {
    for (const target of TARGETS) {
      for (const [, name] of target.selector.matchAll(/data-echo="([^"]+)"/g)) {
        // Menu and tab markers are written from a template: data-echo={`nav:${item.href}`}.
        const templated = /^(nav:|bookings\.tab\.|widget\.tab\.)/.exec(name)?.[1];
        const marker = templated ? `data-echo={\`${templated}\${` : `data-echo="${name}"`;
        expect(UI_SOURCE.includes(marker), `${target.id}: ${marker}`).toBe(true);
      }
      for (const [, id] of target.selector.matchAll(/#([a-z_-]+)/g)) {
        expect(UI_SOURCE.includes(`id="${id}"`), `${target.id}: id="${id}"`).toBe(true);
      }
    }
  });

  it("have unique ids, and a menu target for every page", () => {
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
    for (const page of GUIDE_PAGES) expect(TARGETS.some((t) => t.pages[0] === "*" && t.opens === page.href), page.href).toBe(true);
  });

  it("only include pages on the business's plan", () => {
    const ids = targetsFor(STARTER).map((t) => t.id);
    expect(ids).toContain("nav.knowledge");
    expect(ids).toContain("settings.domains");
    expect(ids).not.toContain("nav.services");
    expect(ids).not.toContain("services.price");
    expect(ids).not.toContain("staff.time_off_add");
  });

  it("match pages and detail pages", () => {
    expect(onPage("/dashboard/staff/*", "/dashboard/staff/abc")).toBe(true);
    expect(onPage("/dashboard/staff/*", "/dashboard/staff")).toBe(false);
    expect(onPage("/dashboard/staff/*", "/dashboard/staff/*")).toBe(true);
    expect(onPage("*", "/dashboard")).toBe(true);
  });
});

describe("planTour", () => {
  const ids = (r: ReturnType<typeof planTour>) => (r.ok ? r.steps.map((s) => s.target) : r.error);

  it("adds the menu click to reach another page", () => {
    const result = planTour(
      [
        { target: "services.edit", say: "Click Edit on the service you want to change." },
        { target: "services.price", say: "Type the new price here." },
        { target: "services.save", say: "Now click Save service." },
      ],
      { pathname: "/dashboard", features: ALL_ON },
    );
    expect(ids(result)).toEqual(["nav.services", "services.edit", "services.price", "services.save"]);
    expect(result.ok && result.steps[0]).toEqual({
      target: "nav.services",
      selector: '[data-echo="nav:/dashboard/services"]',
      action: "click",
      say: "Click Services in the menu.",
    });
  });

  it("doesn't add a menu step when they're already there, and drops one the model added", () => {
    expect(ids(planTour([{ target: "services.price", say: "Here." }], { pathname: "/dashboard/services", features: ALL_ON }))).toEqual([
      "services.price",
    ]);
    expect(
      ids(planTour([{ target: "nav.services", say: "Go." }, { target: "services.price", say: "Here." }], { pathname: "/dashboard/services", features: ALL_ON })),
    ).toEqual(["services.price"]);
  });

  it("goes through the list to reach a detail page", () => {
    expect(ids(planTour([{ target: "staff.time_off_from", say: "Pick the first day off." }], { pathname: "/dashboard/leads", features: ALL_ON }))).toEqual([
      "nav.staff",
      "staff.open",
      "staff.time_off_from",
    ]);
    // Already on a person's page: straight there.
    expect(ids(planTour([{ target: "staff.time_off_add", say: "Add it." }], { pathname: "/dashboard/staff/123", features: ALL_ON }))).toEqual([
      "staff.time_off_add",
    ]);
  });

  it("refuses targets that don't exist or aren't on their plan", () => {
    expect(planTour([{ target: "services.price", say: "x" }], { pathname: "/dashboard", features: STARTER })).toEqual({
      ok: false,
      error: "Not targets you can use: services.price. Use ids from the target list.",
    });
    expect(planTour([{ target: "#price_rand", say: "x" }], { pathname: "/dashboard", features: ALL_ON }).ok).toBe(false);
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
    for (const p of [
      "https://evil.example/dashboard",
      "//evil.example",
      "/dashboard/services",
      "/dashboard/nope",
      "/dashboard/../admin",
      "/admin",
      "/dashboard/widget?tab=chat&next=https://evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeDashboardLink(p, allowed), p).toBeNull();
    }
  });
});

describe("parseEchoToolInput", () => {
  const valid = { steps: [{ target: "services.price", say: "Type it here." }], done: "Done." };

  it("accepts a walkthrough and rejects unknown tools and bad input", () => {
    expect(parseEchoToolInput({ name: "guide_me", input: valid }).ok).toBe(true);
    expect(parseEchoToolInput({ name: "show_page", input: {} }).ok).toBe(false);
    expect(parseEchoToolInput({ name: "toString", input: {} })).toEqual({ ok: false, error: "Unknown tool: toString" });
    expect(parseEchoToolInput({ name: "guide_me", input: { steps: [], done: "Done." } }).ok).toBe(false);
    expect(parseEchoToolInput({ name: "guide_me", input: { steps: valid.steps } }).ok).toBe(false);
    expect(parseEchoToolInput({ name: "guide_me", input: { ...valid, steps: Array(9).fill(valid.steps[0]) } }).ok).toBe(false);
    expect(parseEchoToolInput({ name: "guide_me", input: undefined }).ok).toBe(false);
  });
});

describe("buildEchoPrompt", () => {
  it("puts the persona, then the rules, then the owner's page, setup, the fenced guide and the targets", () => {
    const prompt = buildEchoPrompt({
      businessName: "Demo Salon",
      currentPage: pageForPath("/dashboard/services"),
      pathname: "/dashboard/services",
      setup: "SETUP TEXT",
      guide: "GUIDE TEXT",
      targets: "TARGET LIST",
    });
    const order = [
      prompt.indexOf("You are Echo"),
      prompt.indexOf(ECHO_RULES),
      prompt.indexOf("They're on: Services (/dashboard/services)"),
      prompt.indexOf("<setup_progress>\nSETUP TEXT\n</setup_progress>"),
      prompt.indexOf("<dashboard_guide>\nGUIDE TEXT\n</dashboard_guide>"),
      prompt.indexOf("TARGET LIST\n</targets>"),
    ];
    expect(order[0]).toBe(0);
    expect(order.every((at, i) => i === 0 || at > order[i - 1])).toBe(true);
    expect(prompt).toContain("<business_name>Demo Salon</business_name>");
  });

  it("says when the page isn't in the guide", () => {
    const prompt = buildEchoPrompt({ businessName: "", currentPage: null, pathname: "/dashboard/upgrade/bookings", setup: "", guide: "", targets: "" });
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
  runAgentTurn: async function* (params: {
    system: string;
    executeTool: (c: { name: string; input: unknown }) => Promise<string>;
    endTurn?: () => boolean;
  }) {
    scripted.system = params.system;
    for (const call of scripted.calls) scripted.results.push(await params.executeTool(call));
    // As the real loop does: a turn ended by a tool gets no follow-up reply.
    if (params.endTurn?.()) return;
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

  async function run(features: Features, pathname = "/dashboard") {
    const { runEcho } = await import("../lib/echo/engine");
    const events = [];
    for await (const e of runEcho({
      supabase: {} as SupabaseClient,
      tenantId: "tenant-1",
      businessName: "Demo Salon",
      features,
      pathname,
      messages: [{ role: "user", content: "help" }],
      signal: new AbortController().signal,
    })) {
      events.push(e);
    }
    return events;
  }

  it("ends the turn with the plan's intro and the walkthrough, with no follow-up call or page buttons", async () => {
    scripted.calls = [
      { name: "guide_me", input: { steps: [{ target: "services.price", say: "Type the new price." }], intro: "**Sure**, watch my cursor.", done: "All set." } },
    ];
    scripted.reply = "This follow-up should never be asked for. [Services](/dashboard/services)";
    const events = await run(ALL_ON);
    expect(events).toEqual([
      { type: "text", text: "Sure, watch my cursor." },
      {
        type: "tour",
        done: "All set.",
        steps: [
          { target: "nav.services", selector: '[data-echo="nav:/dashboard/services"]', action: "click", say: "Click Services in the menu." },
          { target: "services.price", selector: "#price_rand", action: "fill", say: "Type the new price." },
        ],
      },
    ]);
  });

  it("hands bad walkthroughs back to the model and shows none", async () => {
    scripted.calls = [
      { name: "guide_me", input: { steps: [{ target: "services.price", say: "x" }], done: "y" } },
      { name: "guide_me", input: { steps: [{ target: "services.price" }], done: "y" } },
    ];
    const events = await run(STARTER);
    expect(events).toEqual([{ type: "text", text: "Here you go." }]);
    expect(scripted.results[0]).toContain("Not targets you can use: services.price");
    expect(scripted.results[1]).toMatch(/^Invalid input for guide_me/);
  });

  it("gives the model this tenant's real setup progress and its targets", async () => {
    setupSteps.mockResolvedValue([{ title: "Set your hours", text: "t", href: "/dashboard/availability", done: false }]);
    await run(STARTER);
    expect(setupSteps).toHaveBeenCalledWith(expect.anything(), "tenant-1", false);
    expect(scripted.system).toContain("[to do] Set your hours");
    expect(scripted.system).toContain("settings.domains (type/choose)");
    expect(scripted.system).not.toContain("services.price");
  });

  it("gives no button to the page they're already on", async () => {
    scripted.reply = "Add one here. [Knowledge](/dashboard/knowledge)";
    const events = await run(ALL_ON, "/dashboard/knowledge");
    expect(events).toEqual([{ type: "text", text: "Add one here." }]);
  });
});
