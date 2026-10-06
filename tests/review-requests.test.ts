import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOW_RATING_MAX, parseRating, ratingReply, reviewRequestText } from "../lib/bookings/rating";
import { describeEvent } from "../lib/bookings/labels";

const notifyLowRating = vi.fn();
vi.mock("../lib/email/notify-low-rating", () => ({ notifyOwnerOfLowRating: (...a: unknown[]) => notifyLowRating(...a) }));
const sendText = vi.fn();
const sendTemplate = vi.fn();
vi.mock("../lib/channels/whatsapp", async (orig) => ({
  ...(await orig<typeof import("../lib/channels/whatsapp")>()),
  sendWhatsAppText: (...a: unknown[]) => sendText(...a),
  sendWhatsAppTemplate: (...a: unknown[]) => sendTemplate(...a),
}));

const { handleRatingReply, sendReviewRequest } = await import("../lib/bookings/review-requests");

const URL = "https://g.page/r/demo/review";

describe("parseRating", () => {
  it("accepts a reply that is only a score", () => {
    for (const [msg, n] of [["5", 5], [" 4 ", 4], ["4/5", 4], ["3 stars", 3], ["1 star.", 1], ["5!", 5], ["⭐⭐⭐⭐", 4], ["⭐️⭐️⭐️", 3], ["2 out of 5", 2]] as const) {
      expect(parseRating(msg), msg).toBe(n);
    }
  });

  it("leaves anything else for the AI", () => {
    for (const msg of ["I'll come at 4", "0", "6", "10", "45", "5 people", "can I book for 2", "great", ""]) {
      expect(parseRating(msg), msg).toBeNull();
    }
  });
});

describe("no review gating", () => {
  it("puts the Google link in the request every customer gets", () => {
    expect(reviewRequestText({ name: "Thandi", business: "Demo Salon", service: "Haircut", reviewUrl: URL })).toBe(
      `Hi Thandi, thanks for visiting Demo Salon! How was your Haircut? Reply with a number from 1 (poor) to 5 (great).\n\n` +
        `If you have a moment, a Google review helps us a lot: ${URL}\n\nThank you!`,
    );
  });

  it("offers the same link whatever the score", () => {
    for (let rating = 1; rating <= 5; rating++) {
      expect(ratingReply({ rating, reviewUrl: URL })).toContain(URL);
    }
    expect(ratingReply({ rating: LOW_RATING_MAX, reviewUrl: URL })).toMatch(/sorry/);
    expect(ratingReply({ rating: 5, reviewUrl: null })).toBe("Thank you, we're so glad to hear it!");
  });
});

describe("review history wording", () => {
  const base = { actor: "system", channel: "whatsapp", created_by: null, created_at: "2026-10-04T06:00:00Z" };
  it("describes each step", () => {
    expect(describeEvent({ ...base, type: "review_requested", details: { via: "template" } })).toBe(
      "Review request sent on WhatsApp (template)",
    );
    expect(describeEvent({ ...base, type: "review_not_sent", details: { reason: "opted_out" } })).toBe(
      "Review request not sent: they replied STOP",
    );
    expect(describeEvent({ ...base, type: "review_rated", actor: "ai", details: { rating: 2 } })).toBe(
      "Customer rated the visit 2/5",
    );
  });
});

// A Supabase stand-in that records every filter and write per table.
function fakeAdmin(opts: { openBooking?: boolean; claimed?: boolean; optedOut?: boolean; rated?: boolean } = {}) {
  const log: string[] = [];
  const result = (table: string, op: string) => {
    if (table === "bookings" && op === "select") {
      return { data: opts.openBooking ? { id: "b1", name: "Thandi", phone: "0821234567", starts_at: "2026-10-03T08:00:00Z", services: { name: "Haircut" } } : null };
    }
    if (table === "bookings" && op === "update") return { data: (opts.claimed ?? true) && (opts.rated ?? true) ? [{ id: "b1" }] : [] };
    if (table === "contacts") return { data: { opted_out_at: opts.optedOut ? "2026-10-01T00:00:00Z" : null } };
    return { data: null, error: null };
  };
  const client = {
    from: (table: string) => {
      let op = "select";
      const q: Record<string, unknown> = {};
      const chain = (name: string) => (...args: unknown[]) => {
        if (name === "update" || name === "insert") op = name;
        log.push(`${table}.${name}(${args.map((a) => JSON.stringify(a)).join(",")})`);
        return q;
      };
      for (const m of ["select", "eq", "is", "gte", "order", "limit", "update", "insert"]) q[m] = chain(m);
      q.maybeSingle = async () => result(table, op);
      q.then = (resolve: (v: unknown) => void) => resolve(result(table, op));
      return q;
    },
  };
  return { admin: client as unknown as SupabaseClient, log };
}

const ratingInput = {
  tenantId: "tenant-a",
  contactId: "contact-1",
  conversationId: "conv-1",
  businessName: "Demo Salon",
  reviewUrl: URL,
};

describe("handleRatingReply", () => {
  beforeEach(() => notifyLowRating.mockReset());

  it("ignores messages that aren't a score without touching the database", async () => {
    const { admin, log } = fakeAdmin({ openBooking: true });
    expect(await handleRatingReply(admin, { ...ratingInput, text: "what time do you open?" })).toBeNull();
    expect(log).toEqual([]);
  });

  it("only looks at this tenant's and this customer's open request", async () => {
    const { admin, log } = fakeAdmin({ openBooking: false });
    expect(await handleRatingReply(admin, { ...ratingInput, text: "5" })).toBeNull();
    expect(log).toEqual(
      expect.arrayContaining([
        'bookings.eq("tenant_id","tenant-a")',
        'bookings.eq("contact_id","contact-1")',
        'bookings.eq("review_request_status","sent")',
        'bookings.is("review_rating",null)',
      ]),
    );
  });

  it("records the score, thanks them with the link, and alerts on a low score", async () => {
    const { admin, log } = fakeAdmin({ openBooking: true });
    const reply = await handleRatingReply(admin, { ...ratingInput, text: "2" });
    expect(reply).toContain(URL);
    expect(log.some((l) => l.startsWith('bookings.update({"review_rating":2'))).toBe(true);
    expect(log.some((l) => l.includes('"type":"review_rated"'))).toBe(true);
    expect(notifyLowRating).toHaveBeenCalledOnce();
  });

  it("doesn't alert on a good score", async () => {
    const { admin } = fakeAdmin({ openBooking: true });
    await handleRatingReply(admin, { ...ratingInput, text: "5" });
    expect(notifyLowRating).not.toHaveBeenCalled();
  });

  it("does nothing on a duplicate delivery of an already-rated request", async () => {
    const { admin } = fakeAdmin({ openBooking: true, rated: false });
    expect(await handleRatingReply(admin, { ...ratingInput, text: "2" })).toBeNull();
    expect(notifyLowRating).not.toHaveBeenCalled();
  });
});

describe("sendReviewRequest", () => {
  const booking = {
    id: "b1",
    tenant_id: "tenant-a",
    name: "Thandi",
    phone: "0821234567",
    starts_at: "2026-10-03T08:00:00Z",
    contact_id: "contact-1",
    conversation_id: null,
    serviceName: "Haircut",
  };
  const channel = { phoneNumberId: "pn", accessToken: "tok", businessName: "Demo Salon", googleReviewUrl: URL };

  beforeEach(() => {
    sendText.mockReset();
    sendTemplate.mockReset();
  });

  it("is only ever attempted once per booking", async () => {
    const { admin } = fakeAdmin({ claimed: false });
    expect(await sendReviewRequest(admin, booking, channel)).toBe("already_claimed");
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("never messages a customer who replied STOP", async () => {
    const { admin, log } = fakeAdmin({ optedOut: true });
    expect(await sendReviewRequest(admin, booking, channel)).toBe("not_sent");
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(log.some((l) => l.includes('"reason":"opted_out"'))).toBe(true);
  });

  it("uses the template outside the 24h window, with the link for everyone", async () => {
    const { admin } = fakeAdmin();
    expect(await sendReviewRequest(admin, booking, channel)).toBe("sent");
    expect(sendTemplate).toHaveBeenCalledWith("pn", "tok", "27821234567", "review_request", "en", ["Thandi", "Demo Salon", "Haircut", URL]);
  });

  it("records a template the business hasn't had approved", async () => {
    sendTemplate.mockRejectedValueOnce(new Error('WhatsApp send failed 404: {"error":{"code":132001}}'));
    const { admin, log } = fakeAdmin();
    expect(await sendReviewRequest(admin, booking, channel)).toBe("not_sent");
    expect(log.some((l) => l.includes('"reason":"no_template"'))).toBe(true);
  });
});
