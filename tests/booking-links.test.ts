import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBookingToken, readBookingToken } from "../lib/security/signed-token";
import { bookingIcs } from "../lib/bookings/ics";
import { renderCustomerBookingEmail } from "../lib/email/customer-booking";
import { looksLikeBot } from "../lib/widgets/spam";

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const FUTURE = new Date("2031-01-01T00:00:00Z");

beforeEach(() => vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("booking link tokens", () => {
  it("round-trips the booking id", () => {
    expect(readBookingToken(createBookingToken(ID, FUTURE))).toBe(ID);
  });

  it("rejects altered, foreign, expired and junk tokens", () => {
    const token = createBookingToken(ID, FUTURE);
    const [payload, sig] = token.split(".");
    const flipped = Buffer.from(payload, "base64url");
    flipped[0] ^= 1;
    expect(readBookingToken(`${flipped.toString("base64url")}.${sig}`)).toBeNull();
    expect(readBookingToken(createBookingToken(ID, new Date("2020-01-01T00:00:00Z")))).toBeNull();
    expect(readBookingToken("nonsense")).toBeNull();
    expect(readBookingToken("")).toBeNull();

    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(readBookingToken(token)).toBeNull();
  });
});

describe("bookingIcs", () => {
  const ics = bookingIcs({
    uid: ID,
    title: "Cut, wash; blow-dry at Demo Salon",
    startsAt: "2026-10-12T08:00:00Z",
    endsAt: "2026-10-12T08:45:00Z",
    description: `Reference 3F2B8C1E ${"x".repeat(100)}`,
    now: new Date("2026-10-07T10:00:00Z"),
  });

  it("is a valid single event in UTC with CRLF line ends", () => {
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("DTSTART:20261012T080000Z\r\n");
    expect(ics).toContain("DTEND:20261012T084500Z\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes special characters and folds long lines", () => {
    expect(ics).toContain("SUMMARY:Cut\\, wash\\; blow-dry at Demo Salon");
    expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
  });
});

describe("renderCustomerBookingEmail", () => {
  const booking = {
    id: ID,
    name: "<b>Thandi</b>",
    email: "t@example.com",
    startsAt: "2026-10-12T08:00:00Z",
    endsAt: "2026-10-12T08:45:00Z",
    serviceName: "Cut",
    staffName: "Lebo",
    businessName: "Demo Salon",
    contact: "021 555 0134",
  };

  it("confirms with a calendar file and a manage link, escaping names", () => {
    const email = renderCustomerBookingEmail("confirmed", booking, { manageUrl: "https://x.test/b/abc" });
    expect(email.subject).toBe("Booking confirmed: Cut at Demo Salon");
    expect(email.html).toContain("&lt;b&gt;Thandi&lt;/b&gt;");
    expect(email.html).toContain("https://x.test/b/abc");
    expect(email.html).toContain("Monday 12 October at 10:00");
    expect(email.ics).toContain("BEGIN:VCALENDAR");
  });

  it("sends no calendar file for a request, and no manage link once declined", () => {
    expect(renderCustomerBookingEmail("requested", booking, { manageUrl: "https://x.test/b/abc" }).ics).toBeNull();
    const declined = renderCustomerBookingEmail("declined", booking, { manageUrl: "https://x.test/b/abc", reason: "Fully booked" });
    expect(declined.html).not.toContain("https://x.test/b/abc");
    expect(declined.html).toContain("Fully booked");
  });
});

describe("looksLikeBot", () => {
  it("flags a filled hidden field or an instant submit", () => {
    expect(looksLikeBot({ honeypot: "", elapsedMs: 20_000 })).toBe(false);
    expect(looksLikeBot({ honeypot: "http://spam", elapsedMs: 20_000 })).toBe(true);
    expect(looksLikeBot({ elapsedMs: 800 })).toBe(true);
  });
});
