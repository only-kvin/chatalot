import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEvent } from "../lib/events/public";
import type { SignupResult } from "../lib/events/signup";

const events: PublicEvent[] = [];
vi.mock("../lib/events/public", () => ({ listPublicEvents: async () => events }));
const signUp = vi.fn(async (_admin: unknown, _input: unknown): Promise<SignupResult> => ({ ok: true, signupId: "s1", repeat: false, payment: null, payAtEvent: false, spotsLeft: 3 }));
vi.mock("../lib/events/signup", () => ({ signUpForEvent: (a: unknown, i: unknown) => signUp(a, i) }));

import { eventRef, listEventsForAgent, signUpFromChat } from "../lib/agent/event-tools";
import { toolsFor } from "../lib/agent/tools";
import { buildSystemPrompt } from "../lib/agent/prompt";
import { executeTool } from "../lib/agent/engine";

const ev = (over: Partial<PublicEvent>): PublicEvent => ({
  id: "1a2b3c4d-0000-4000-8000-000000000001",
  title: "Wine night",
  summary: "Six estates.",
  description: "",
  startsAt: "2026-12-05T16:00:00Z",
  endsAt: "2026-12-05T19:00:00Z",
  location: "12 Main Rd",
  posterUrl: null,
  priceCents: null,
  maxPerSignup: 4,
  spotsLeft: 6,
  closed: null,
  ...over,
});
const admin = {} as SupabaseClient;
const ctx = { tenantId: "t1", conversationId: "c1" };
const input = { event: "E-1A2B3C", name: "Thandi", phone: "0821234567", email: null, tickets: 2 };

beforeEach(() => {
  events.length = 0;
  signUp.mockClear();
});

describe("offering the event tools", () => {
  it("only to businesses that run events, with or without bookings", () => {
    const names = (b: boolean, e: boolean) => toolsFor(b, false, e).map((t) => t.name);
    expect(names(false, true)).toEqual(["save_lead", "request_human", "list_events", "sign_up_for_event"]);
    expect(names(true, false)).not.toContain("list_events");
    expect(names(true, true)).toEqual(expect.arrayContaining(["create_booking", "list_events", "sign_up_for_event"]));
  });

  it("tells the model how to use them only when events are on", () => {
    const config = { business_name: "The Courtyard", tone: "friendly", greeting: "", system_prompt_extra: "", handoff_contact: "" };
    expect(buildSystemPrompt(config as never, "", [], [], false, true)).toContain("call list_events and answer only from its result");
    expect(buildSystemPrompt(config as never, "", [], [], false, false)).not.toContain("list_events");
  });

  it("refuses the event tools for a business without events, whatever the model asks", async () => {
    const r = await executeTool(admin, { tenantId: "t1", businessName: "X", conversationId: "c1", channel: "web", whatsappAvailable: false, cutoffMinutes: 120, takesBookings: true, takesEvents: false }, { name: "list_events", input: {} });
    expect(r).toMatch(/doesn't list events/);
  });
});

describe("list_events", () => {
  it("lists references, times, prices and spots, and nothing else", async () => {
    events.push(ev({}), ev({ id: "9f8e7d6c-0000-4000-8000-000000000002", title: "Yoga", priceCents: 8000, spotsLeft: 0, closed: "sold_out", maxPerSignup: 1 }));
    const text = await listEventsForAgent(admin, "t1");
    expect(text).toContain("E-1A2B3C: Wine night · Saturday 5 December at 18:00–21:00 · 12 Main Rd · free · 6 spots left · up to 4 tickets per sign-up · Six estates.");
    expect(text).toContain("E-9F8E7D: Yoga");
    expect(text).toContain("R80 per ticket · SOLD OUT");
    expect(text).toContain("never invent");
  });
  it("says when nothing is on", async () => {
    expect(await listEventsForAgent(admin, "t1")).toMatch(/no upcoming events/);
  });
});

describe("sign_up_for_event", () => {
  it("finds the event by reference or title and signs up once per chat", async () => {
    events.push(ev({}));
    for (const event of ["E-1A2B3C", "e-1a2b3c", "1a2b3c", "Wine night", "wine"]) {
      signUp.mockClear();
      const r = await signUpFromChat(admin, ctx, { ...input, event });
      expect(r).toContain("Signed up: 2 tickets for Wine night on Saturday 5 December at 18:00 at 12 Main Rd (E-1A2B3C).");
      expect(signUp.mock.calls[0]![1]).toMatchObject({ eventId: ev({}).id, quantity: 2, idempotencyKey: `chat:c1:${ev({}).id}` });
    }
    expect(eventRef(ev({}).id)).toBe("E-1A2B3C");
  });

  it("asks for the exact reference when a title is ambiguous or unknown", async () => {
    events.push(ev({}), ev({ id: "2b2b2b2b-0000-4000-8000-000000000003", title: "Wine night" }));
    expect(await signUpFromChat(admin, ctx, { ...input, event: "Wine night" })).toMatch(/More than one event matches/);
    expect(await signUpFromChat(admin, ctx, { ...input, event: "Karaoke" })).toMatch(/No upcoming event matches/);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("gives the pay link for paid tickets, and says what's owed at the door otherwise", async () => {
    events.push(ev({ priceCents: 15000 }));
    signUp.mockResolvedValueOnce({ ok: true, signupId: "s1", repeat: false, payAtEvent: false, spotsLeft: 1, payment: { paymentId: "p1", amountCents: 30000, dueAt: new Date(Date.now() + 30 * 60_000).toISOString(), url: "https://app/pay/p1" } });
    expect(await signUpFromChat(admin, ctx, input)).toMatch(/must pay R300 online within (29|30) minutes at https:\/\/app\/pay\/p1/);
    signUp.mockResolvedValueOnce({ ok: true, signupId: "s1", repeat: false, payment: null, payAtEvent: true, spotsLeft: 1 });
    expect(await signUpFromChat(admin, ctx, input)).toContain("They pay R300 at the event.");
  });

  it("explains refusals, and doesn't double-book a repeated request", async () => {
    events.push(ev({}));
    signUp.mockResolvedValueOnce({ ok: false, reason: "sold_out", spotsLeft: 1 });
    expect(await signUpFromChat(admin, ctx, input)).toMatch(/Not enough spots left \(1 left\)/);
    signUp.mockResolvedValueOnce({ ok: false, reason: "too_many", max: 4 });
    expect(await signUpFromChat(admin, ctx, input)).toMatch(/at most 4 per sign-up/);
    signUp.mockResolvedValueOnce({ ok: true, signupId: "s1", repeat: true, payment: null, payAtEvent: false, spotsLeft: 3 });
    expect(await signUpFromChat(admin, ctx, input)).toMatch(/already signed up .*(no new sign-up was made)/);
  });
});
