import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOriginAllowed, isOwnAppRequest } from "../lib/security/origin-check";

describe("isOriginAllowed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows an origin in the tenant's allowed_domains list", () => {
    expect(isOriginAllowed("https://client-site.com", ["client-site.com"])).toBe(true);
  });

  it("rejects an origin not in the allowed_domains list", () => {
    expect(isOriginAllowed("https://evil.com", ["client-site.com"])).toBe(false);
  });

  it("rejects an unparsable origin", () => {
    expect(isOriginAllowed("not-a-url", ["client-site.com"])).toBe(false);
  });

  describe("in development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("allows localhost regardless of allowed_domains", () => {
      expect(isOriginAllowed("http://localhost:3000", [])).toBe(true);
    });

    it("allows a missing Origin header (same-origin fetch omits it)", () => {
      expect(isOriginAllowed(null, [])).toBe(true);
    });
  });

  describe("in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("rejects localhost unless explicitly in allowed_domains", () => {
      expect(isOriginAllowed("http://localhost:3000", [])).toBe(false);
    });

    it("rejects a missing Origin header", () => {
      expect(isOriginAllowed(null, [])).toBe(false);
    });
  });
});

describe("isOwnAppRequest", () => {
  const req = (headers: Record<string, string>) => new Request("https://chatalot.vercel.app/api/public/services", { headers });

  it("recognises ChatAlot's own pages (dashboard previews)", () => {
    expect(isOwnAppRequest(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isOwnAppRequest(req({ origin: "https://chatalot.vercel.app" }))).toBe(true);
  });

  it("doesn't mistake other sites for it", () => {
    expect(isOwnAppRequest(req({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe(false);
    expect(isOwnAppRequest(req({ origin: "https://chatalot.vercel.app.evil.example" }))).toBe(false);
    expect(isOwnAppRequest(req({}))).toBe(false);
  });
});
