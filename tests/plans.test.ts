import { describe, it, expect } from "vitest";
import { planFor, resolveFeatures, WIDGET_FEATURE } from "../lib/plans";
import { toolsFor } from "../lib/agent/tools";
import { buildSystemPrompt } from "../lib/agent/prompt";
import { NAV_GROUPS, navForFeatures } from "../app/(dashboard)/dashboard/nav-items";

describe("resolveFeatures", () => {
  it("gives each plan its features and locks the rest", () => {
    expect(resolveFeatures("starter", {})).toEqual({
      web_chat: "on",
      contact_form: "on",
      whatsapp: "locked",
      bookings: "locked",
      reviews: "locked",
      registration: "locked",
    });
    const growth = resolveFeatures("growth", {});
    expect(growth.whatsapp).toBe("on");
    expect(growth.bookings).toBe("on");
    expect(growth.reviews).toBe("locked");
    expect(Object.values(resolveFeatures("pro", {})).every((s) => s === "on")).toBe(true);
    expect(Object.values(resolveFeatures("trial", {})).every((s) => s === "on")).toBe(true);
  });

  it("lets the admin grant a feature or hide it", () => {
    expect(resolveFeatures("starter", { bookings: "on" }).bookings).toBe("on");
    // Off hides even what the plan includes.
    expect(resolveFeatures("pro", { bookings: "off" }).bookings).toBe("hidden");
  });

  it("makes review requests follow bookings", () => {
    // Reviews granted, but bookings locked: reviews can't work, so locked too.
    expect(resolveFeatures("starter", { reviews: "on" }).reviews).toBe("locked");
    // Bookings hidden (a plumber): reviews hidden with it, not shown locked.
    expect(resolveFeatures("pro", { bookings: "off" }).reviews).toBe("hidden");
    // Reviews' own "off" wins.
    expect(resolveFeatures("pro", { reviews: "off" }).reviews).toBe("hidden");
  });

  it("ignores malformed overrides instead of failing", () => {
    expect(resolveFeatures("growth", { bookings: "maybe" }).bookings).toBe("on");
    expect(resolveFeatures("growth", null).bookings).toBe("on");
  });

  it("names the cheapest plan with a feature", () => {
    expect(planFor("bookings")).toBe("growth");
    expect(planFor("reviews")).toBe("pro");
    expect(planFor("web_chat")).toBe("starter");
  });

  it("maps every widget to a feature", () => {
    expect(WIDGET_FEATURE.schedule).toBe("bookings");
    expect(WIDGET_FEATURE.registration).toBe("registration");
  });
});

describe("menu for a plan", () => {
  const labels = (features: ReturnType<typeof resolveFeatures>) =>
    navForFeatures(NAV_GROUPS, features).flatMap((g) => g.items.map((i) => `${i.label}${i.locked ? " (locked)" : ""}`));

  it("collapses a locked feature to one locked item", () => {
    const items = labels(resolveFeatures("starter", {}));
    expect(items).toContain("Bookings (locked)");
    expect(items).not.toContain("Services (locked)");
    expect(items).not.toContain("Staff");
  });

  it("drops a hidden feature entirely", () => {
    const groups = navForFeatures(NAV_GROUPS, resolveFeatures("pro", { bookings: "off" }));
    expect(groups.map((g) => g.label)).not.toContain("Schedule");
  });

  it("points locked items at the upgrade page", () => {
    const item = navForFeatures(NAV_GROUPS, resolveFeatures("starter", {}))
      .flatMap((g) => g.items)
      .find((i) => i.locked);
    expect(item?.href).toBe("/dashboard/upgrade/bookings");
  });
});

describe("AI without bookings", () => {
  it("offers only the lead and handoff tools", () => {
    expect(toolsFor(false).map((t) => t.name).sort()).toEqual(["request_human", "save_lead"]);
    expect(toolsFor(true).map((t) => t.name)).toContain("create_booking");
  });

  it("tells the model to take callback details, without mentioning plans", () => {
    const config = {
      business_name: "Pipe Pros",
      tone: "friendly",
      greeting: "Hi",
      system_prompt_extra: "",
      handoff_contact: "",
    };
    const prompt = buildSystemPrompt(config, "", [], [], false);
    expect(prompt).toContain("can't make, change or check bookings");
    expect(prompt.toLowerCase()).not.toContain("plan");
    expect(buildSystemPrompt(config, "")).not.toContain("can't make, change or check bookings");
  });
});
