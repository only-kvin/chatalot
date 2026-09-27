import { describe, it, expect, vi, afterEach } from "vitest";
import { renderOwnerEmail } from "../lib/email/send";
import { safeNextPath } from "../lib/safe-next";
import { appUrl } from "../lib/app-url";
import { notificationPath } from "../lib/notifications";

afterEach(() => vi.unstubAllEnvs());

describe("renderOwnerEmail", () => {
  it("escapes customer-supplied text", () => {
    const html = renderOwnerEmail({
      subject: "s",
      intro: "New lead",
      details: [["Name", `<img src=x onerror="alert(1)">`]],
      path: "/dashboard/leads",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("links the button to the production dashboard page", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "chatalot.vercel.app");
    const html = renderOwnerEmail({ subject: "s", intro: "i", details: [], path: "/dashboard/conversations/abc" });
    expect(html).toContain('href="https://chatalot.vercel.app/dashboard/conversations/abc"');
    expect(html).toContain("Open in ChatAlot");
  });

  it("skips empty details", () => {
    const html = renderOwnerEmail({ subject: "s", intro: "i", details: [["Email", null]], path: "/" });
    expect(html).not.toContain("Email:");
  });
});

describe("appUrl", () => {
  it("prefers Vercel's production domain over per-deployment URLs", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "chatalot.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://chatalot-abc-team.vercel.app");
    expect(appUrl("/widget.js")).toBe("https://chatalot.vercel.app/widget.js");
  });

  it("falls back to NEXT_PUBLIC_APP_URL off Vercel", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000/");
    expect(appUrl("/login")).toBe("http://localhost:3000/login");
  });
});

describe("notificationPath", () => {
  it("opens the conversation when there is one, else the list", () => {
    expect(notificationPath("human_requested", "c1")).toBe("/dashboard/conversations/c1");
    expect(notificationPath("new_booking", null)).toBe("/dashboard/bookings");
    expect(notificationPath("new_lead")).toBe("/dashboard/leads");
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/dashboard/conversations/abc?x=1")).toBe("/dashboard/conversations/abc?x=1");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null, undefined]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
