import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "../lib/security/meta-signature";

const SECRET = "test-app-secret";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  beforeEach(() => {
    vi.stubEnv("META_APP_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const body = JSON.stringify({ entry: [{ id: "123" }] });

  it("accepts a correctly signed body", () => {
    expect(verifyMetaSignature(body, sign(body))).toBe(true);
  });

  it("rejects a body that doesn't match the signature", () => {
    const tampered = JSON.stringify({ entry: [{ id: "456" }] });
    expect(verifyMetaSignature(tampered, sign(body))).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"))).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature(body, null)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyMetaSignature(body, "not-a-valid-header")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=deadbeef")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=not-hex")).toBe(false);
  });
});
