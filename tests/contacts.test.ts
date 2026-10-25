import { describe, it, expect } from "vitest";
import { canonicalPhone, formatPhone } from "../lib/contacts/phone";
import { mergeContact } from "../lib/contacts/upsert";

describe("canonicalPhone", () => {
  it("treats every way of writing the same SA number as one", () => {
    for (const raw of ["0825550134", "082 555 0134", "+27 82 555 0134", "27825550134", "(082) 555-0134"]) {
      expect(canonicalPhone(raw), raw).toBe("27825550134");
    }
  });

  it("keeps international numbers as given", () => {
    expect(canonicalPhone("+1 555 192 4773")).toBe("15551924773");
    expect(canonicalPhone("+44 20 7946 0958")).toBe("442079460958");
  });

  it("refuses what it can't read rather than guessing", () => {
    for (const raw of ["", null, undefined, "12345", "call me", "0000000000000000000"]) {
      expect(canonicalPhone(raw), String(raw)).toBeNull();
    }
  });

  it("formats SA numbers for display", () => {
    expect(formatPhone("27825550134")).toBe("+27 82 555 0134");
    expect(formatPhone("15551924773")).toBe("+15551924773");
    expect(formatPhone(null)).toBe("");
  });
});

describe("mergeContact", () => {
  const now = "2026-09-28T10:00:00.000Z";
  const base = {
    name: null,
    name_source: null,
    phone: "27825550134",
    email: null,
    consent_at: null,
    last_seen_at: "2026-09-27T10:00:00.000Z",
  } as const;

  it("a name the customer typed beats their WhatsApp profile name", () => {
    const fromProfile = { ...base, name: "JD 🔥", name_source: "whatsapp_profile" as const };
    expect(mergeContact(fromProfile, { tenantId: "t", channel: "web", name: "Jaden Madderson", nameSource: "customer" }, now))
      .toMatchObject({ name: "Jaden Madderson", name_source: "customer" });
  });

  it("a WhatsApp profile name never replaces a typed or owner-set name", () => {
    for (const source of ["customer", "owner"] as const) {
      const named = { ...base, name: "Jaden Madderson", name_source: source };
      const patch = mergeContact(named, { tenantId: "t", channel: "whatsapp", name: "JD 🔥", nameSource: "whatsapp_profile" }, now);
      expect(patch.name).toBeUndefined();
    }
  });

  it("fills a missing email and records consent once", () => {
    const patch = mergeContact(base, { tenantId: "t", channel: "web", email: " Jaden@Example.com ", consent: true }, now);
    expect(patch).toMatchObject({ email: "jaden@example.com", consent_at: now });

    const known = { ...base, email: "old@example.com", consent_at: "2026-09-01T00:00:00.000Z" };
    const again = mergeContact(known, { tenantId: "t", channel: "web", email: "new@example.com", consent: true }, now);
    expect(again.email).toBeUndefined();
    expect(again.consent_at).toBeUndefined();
  });

  it("moves last seen forward only", () => {
    expect(mergeContact(base, { tenantId: "t", channel: "whatsapp" }, now).last_seen_at).toBe(now);
    const older = mergeContact(base, { tenantId: "t", channel: "whatsapp", seenAt: "2026-09-01T00:00:00.000Z" }, now);
    expect(older).toEqual({});
  });
});
