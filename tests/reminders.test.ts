import { describe, it, expect } from "vitest";
import { consentKeyword } from "../lib/contacts/consent";
import { classifyTemplateError, reminderRoute, reminderText } from "../lib/bookings/reminders";
import { describeEvent } from "../lib/bookings/labels";

describe("consentKeyword", () => {
  it("recognises opt-out and opt-in replies", () => {
    for (const msg of ["STOP", "stop", "Stop.", " unsubscribe ", "Opt out", "STOP ALL"]) {
      expect(consentKeyword(msg), msg).toBe("stop");
    }
    for (const msg of ["START", "start!", "Subscribe", "opt in"]) {
      expect(consentKeyword(msg), msg).toBe("start");
    }
  });

  it("never treats booking talk or ordinary messages as an opt-out", () => {
    for (const msg of ["cancel", "stop the booking please", "please stop by at 3", "can I start at 10?", "I want to cancel"]) {
      expect(consentKeyword(msg), msg).toBeNull();
    }
  });
});

describe("reminderRoute", () => {
  it("never messages someone who replied STOP", () => {
    expect(reminderRoute({ optedOut: true, windowOpen: true })).toBe("skip");
  });
  it("uses a normal message inside the 24h window, else the template", () => {
    expect(reminderRoute({ optedOut: false, windowOpen: true })).toBe("message");
    expect(reminderRoute({ optedOut: false, windowOpen: false })).toBe("template");
  });
});

describe("classifyTemplateError", () => {
  it("spots Meta's template errors", () => {
    const missing = new Error(
      'WhatsApp send failed 404: {"error":{"message":"(#132001) Template name does not exist in the translation","type":"OAuthException","code":132001}}',
    );
    expect(classifyTemplateError(missing)).toBe("no_template");
  });
  it("treats anything else as a failed send", () => {
    expect(classifyTemplateError(new Error('WhatsApp send failed 400: {"error":{"code":131030}}'))).toBe("send_failed");
    expect(classifyTemplateError("network down")).toBe("send_failed");
  });
});

describe("reminder wording", () => {
  it("spells out the local date and time", () => {
    expect(
      reminderText({ name: "Cavin", service: "Men's Cut", business: "Demo Salon", startsAt: "2026-09-30T13:00:00Z" }),
    ).toBe("Hi Cavin, a reminder of your Men's Cut at Demo Salon on Wednesday 30 September at 15:00. Reply here if you need to change it.");
  });

  it("explains in the booking history why a reminder didn't go out", () => {
    const base = { actor: "system", channel: "whatsapp", created_by: null, created_at: "2026-09-29T06:00:00Z" };
    expect(describeEvent({ ...base, type: "reminder_not_sent", details: { reason: "opted_out" } })).toBe(
      "Reminder not sent: they replied STOP, so they don't get reminders",
    );
    expect(describeEvent({ ...base, type: "reminder_sent", details: { via: "message" } })).toBe("Reminder sent on WhatsApp");
  });
});
