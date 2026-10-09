import { beforeEach, describe, expect, it, vi } from "vitest";

// The "Get a demo" form's server action, with its outside world mocked: the
// request headers, the rate limiter and the filing (database + email).
const filed = vi.fn();
const limitOk = vi.fn<(ip: string) => Promise<boolean>>(async () => true);
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));
vi.mock("@/lib/db/supabase-admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/security/rate-limit", () => ({ checkDemoRequestLimit: (ip: string) => limitOk(ip) }));
vi.mock("@/lib/marketing/demo-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/marketing/demo-request")>()),
  fileDemoRequest: (...args: unknown[]) => filed(...args),
}));

const { requestDemo } = await import("../app/(marketing)/demo/actions");
const { demoRequestSchema } = await import("../lib/marketing/demo-request");

const valid = {
  name: "Thandi",
  business: "Glow Studio",
  businessType: "beauty",
  phone: "082 555 0134",
  email: "thandi@example.com",
  message: "We get lots of WhatsApps after hours.",
  consent: "on",
};

function form(fields: Record<string, string>, elapsedMs = 8000): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set("elapsedMs", String(elapsedMs));
  return fd;
}

beforeEach(() => {
  filed.mockReset();
  filed.mockResolvedValue(undefined);
  limitOk.mockReset();
  limitOk.mockResolvedValue(true);
});

describe("demoRequestSchema", () => {
  it("accepts a complete request", () => {
    expect(demoRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("requires the POPIA consent tick", () => {
    expect(demoRequestSchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
  });

  it("rejects bad emails, phones and unknown business types", () => {
    expect(demoRequestSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, phone: "call me" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, businessType: "casino" }).success).toBe(false);
  });
});

describe("requestDemo", () => {
  it("files a valid request", async () => {
    expect(await requestDemo({ status: "idle" }, form(valid))).toEqual({ status: "sent" });
    expect(filed).toHaveBeenCalledOnce();
    expect(filed.mock.calls[0][1]).toMatchObject({ name: "Thandi", business: "Glow Studio" });
  });

  it("pretends to succeed for bots, without filing", async () => {
    expect(await requestDemo({ status: "idle" }, form({ ...valid, website: "http://spam" }))).toEqual({ status: "sent" });
    expect(await requestDemo({ status: "idle" }, form(valid, 800))).toEqual({ status: "sent" });
    expect(filed).not.toHaveBeenCalled();
  });

  it("returns field errors for an incomplete form", async () => {
    const result = await requestDemo({ status: "idle" }, form({ name: "Thandi" }));
    expect(result.status).toBe("error");
    expect(result.status === "error" && Object.keys(result.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["business", "businessType", "phone", "email", "consent"]),
    );
    expect(filed).not.toHaveBeenCalled();
  });

  it("refuses when the IP is over its limit", async () => {
    limitOk.mockResolvedValue(false);
    const result = await requestDemo({ status: "idle" }, form(valid));
    expect(result.status).toBe("error");
    expect(limitOk).toHaveBeenCalledWith("203.0.113.9");
    expect(filed).not.toHaveBeenCalled();
  });
});
