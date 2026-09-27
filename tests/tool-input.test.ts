import { describe, it, expect } from "vitest";
import { AGENT_TOOLS, TOOL_INPUT_SCHEMAS, parseToolInput } from "../lib/agent/tools";

describe("parseToolInput", () => {
  it("has a Zod schema for every tool the model is offered", () => {
    expect(Object.keys(TOOL_INPUT_SCHEMAS).sort()).toEqual(AGENT_TOOLS.map((t) => t.name).sort());
  });

  it("accepts valid input and normalises an empty optional email to null", () => {
    const result = parseToolInput({
      name: "save_lead",
      input: { name: " Thandi ", phone: "0821234567", email: "", interest: "braids", summary: "Wants braids" },
    });
    expect(result).toEqual({
      ok: true,
      call: {
        name: "save_lead",
        input: { name: "Thandi", phone: "0821234567", email: null, interest: "braids", summary: "Wants braids" },
      },
    });
  });

  it("rejects missing required fields with a message naming them", () => {
    const result = parseToolInput({ name: "save_lead", input: { name: "Thandi" } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("phone");
      expect(result.error).toContain("interest");
    }
  });

  it("rejects blank strings for required fields", () => {
    expect(parseToolInput({ name: "request_human", input: { reason: "   " } }).ok).toBe(false);
  });

  it("rejects badly formatted booking dates and times", () => {
    const base = { service: "Haircut", name: "Thandi", phone: "0821234567" };
    expect(
      parseToolInput({ name: "create_booking", input: { ...base, date: "tomorrow", time: "10:00" } }).ok,
    ).toBe(false);
    expect(
      parseToolInput({ name: "create_booking", input: { ...base, date: "2026-10-01", time: "25:00" } }).ok,
    ).toBe(false);
    expect(
      parseToolInput({ name: "create_booking", input: { ...base, date: "2026-10-01", time: "09:30" } }).ok,
    ).toBe(true);
  });

  it("rejects unknown tools and non-object input (e.g. malformed argument JSON)", () => {
    expect(parseToolInput({ name: "drop_tables", input: {} })).toEqual({
      ok: false,
      error: "Unknown tool: drop_tables",
    });
    expect(parseToolInput({ name: "request_human", input: undefined }).ok).toBe(false);
  });

  it("does not treat inherited object keys as tool names", () => {
    expect(parseToolInput({ name: "toString", input: {} }).ok).toBe(false);
  });
});
