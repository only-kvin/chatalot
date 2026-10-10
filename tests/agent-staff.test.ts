import { describe, it, expect, vi, afterEach } from "vitest";
import { matchStaff } from "../lib/bookings/catalog";
import { buildSystemPrompt, type AgentConfig } from "../lib/agent/prompt";
import { parseToolInput } from "../lib/agent/tools";
import { bookingLink } from "../lib/widgets/booking-link";

afterEach(() => vi.unstubAllEnvs());

describe("matchStaff", () => {
  const staff = [{ name: "Thandi Mokoena" }, { name: "Lebo Dlamini" }, { name: "Lebo Khumalo" }];
  const match = (q: string) => matchStaff(staff, q)?.name ?? null;

  it("finds a full name, or a first name only one person has", () => {
    expect(match("Thandi Mokoena")).toBe("Thandi Mokoena");
    expect(match("thandi")).toBe("Thandi Mokoena");
    expect(match("Lebo Khumalo")).toBe("Lebo Khumalo");
  });

  it("refuses ambiguous or unknown names instead of guessing", () => {
    expect(match("Lebo")).toBeNull();
    expect(match("Sipho")).toBeNull();
    expect(match("")).toBeNull();
  });
});

describe("staff in the prompt", () => {
  const config: AgentConfig = { business_name: "Demo Salon", tone: "warm", greeting: "Hi", system_prompt_extra: "", handoff_contact: "" };

  it("lists who works here and what they do, only when there's staff", () => {
    const prompt = buildSystemPrompt(config, "", [], [
      { name: "Thandi", role: "Senior stylist", services: ["Balayage", "Men's Cut"] },
      { name: "Lebo", role: "", services: [] },
    ]);
    expect(prompt).toContain("Who works here: Thandi (Senior stylist): Balayage, Men's Cut; Lebo: no services yet.");
    expect(buildSystemPrompt(config, "")).not.toContain("Who works here");
    expect(prompt).toContain("send_booking_link");
  });
});

describe("staff and link tool inputs", () => {
  it("accepts an optional staff name and treats empty as anyone", () => {
    const call = parseToolInput({ name: "check_availability", input: { service: "Cut", date: "2026-10-12", staff: "" } });
    expect(call.ok && call.call.input).toEqual({ service: "Cut", date: "2026-10-12", staff: null, location: null });
    const link = parseToolInput({ name: "send_booking_link", input: {} });
    expect(link.ok && link.call.input).toEqual({ service: null });
  });
});

describe("bookingLink", () => {
  it("uses the hosted page unless the business has its own, with the service filled in", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "chatalot.vercel.app");
    expect(bookingLink({ customUrl: null, slug: "demo-salon" })).toBe("https://chatalot.vercel.app/book/demo-salon");
    expect(bookingLink({ customUrl: null, slug: "demo-salon", serviceId: "s1" })).toBe(
      "https://chatalot.vercel.app/book/demo-salon?ca_service=s1",
    );
    expect(bookingLink({ customUrl: "https://salon.co.za/book?ref=chat", slug: "demo-salon", serviceId: "s1" })).toBe(
      "https://salon.co.za/book?ref=chat&ca_service=s1",
    );
  });
});
