import { describe, it, expect } from "vitest";
import { wantsHuman } from "../lib/agent/handoff-intent";
import { webHandoffMessage, whatsappAction, whatsappContinueUrl } from "../lib/channels/web-handoff";

describe("wantsHuman", () => {
  it("catches the ways visitors ask for a person", () => {
    for (const msg of [
      "can i talk to a human",
      "Can I talk to a person",
      "Can I speak to a person",
      "i dont want to speak with chat bot can i talk to human",
      "I don't want to speak with a chatbot",
      "let me speak to someone please",
      "connect me with an agent",
      "is there a real person there?",
      "human",
      "Agent please",
      "can I chat with the owner",
      "I’d like to talk to your staff", // curly apostrophe
    ]) {
      expect(wantsHuman(msg), msg).toBe(true);
    }
  });

  it("leaves ordinary questions to the AI", () => {
    for (const msg of [
      "can someone do my hair tomorrow?",
      "how much is a haircut for one person?",
      "do you take walk-ins?",
      "I want to book a men's cut",
      "what are your hours",
      "my friend is a real estate agent, can she book too?",
    ]) {
      expect(wantsHuman(msg), msg).toBe(false);
    }
  });
});

describe("whatsappContinueUrl", () => {
  it("adds a ready-to-send message to wa.me links", () => {
    const url = new URL(whatsappContinueUrl("https://wa.me/15551924773")!);
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/15551924773");
    expect(url.searchParams.get("text")).toContain("speak to a person");
  });

  it("keeps a message the owner already set", () => {
    expect(whatsappContinueUrl("https://wa.me/27820000000?text=Hello")).toBe("https://wa.me/27820000000?text=Hello");
  });

  it("rejects non-WhatsApp, insecure or malformed links", () => {
    for (const bad of ["https://evil.example/wa", "http://wa.me/123", "wa.me/123", "javascript:alert(1)", "", null]) {
      expect(whatsappContinueUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe("web handoff reply", () => {
  it("points to WhatsApp when there's a link", () => {
    const text = webHandoffMessage({ whatsapp: true, handoffContact: "021 555 0134" });
    expect(text).toContain("WhatsApp");
    expect(text).toContain("name and phone number");
    expect(whatsappAction("https://wa.me/1")).toEqual({ type: "link", label: "Continue on WhatsApp", url: "https://wa.me/1" });
  });

  it("falls back to the handoff contact, and never promises a reply in the chat", () => {
    const text = webHandoffMessage({ whatsapp: false, handoffContact: "021 555 0134" });
    expect(text).toContain("021 555 0134");
    expect(text).not.toMatch(/reply (here|in this chat)|be with you shortly/i);
    expect(whatsappAction(null)).toBeNull();
  });
});
