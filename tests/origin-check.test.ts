import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOriginAllowed } from "../lib/security/origin-check";

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
