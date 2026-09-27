import { describe, it, expect } from "vitest";
import { isWithinServiceWindow } from "../lib/channels/whatsapp";

const now = new Date("2026-09-27T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

describe("isWithinServiceWindow", () => {
  it("allows free-form sends within 24h of the last inbound message", () => {
    expect(isWithinServiceWindow(hoursAgo(0), now)).toBe(true);
    expect(isWithinServiceWindow(hoursAgo(23.9), now)).toBe(true);
  });

  it("blocks free-form sends at or after 24h", () => {
    expect(isWithinServiceWindow(hoursAgo(24), now)).toBe(false);
    expect(isWithinServiceWindow(hoursAgo(48), now)).toBe(false);
  });

  it("blocks when the customer has never messaged in", () => {
    expect(isWithinServiceWindow(null, now)).toBe(false);
  });
});
