import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../lib/security/crypto";

describe("encrypt/decrypt", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a plaintext value", () => {
    const plaintext = "EAAG_some_meta_access_token_value";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("fails to decrypt with the wrong key", () => {
    const encrypted = encrypt("secret");
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decrypt(encrypted)).toThrow();
  });
});
