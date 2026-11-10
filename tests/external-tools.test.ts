import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  callExternalTool,
  checkEndpoint,
  cleanInput,
  externalToolSchema,
  isBuiltInToolName,
  signExternalToolRequest,
  type ExternalTool,
} from "../lib/agent/external-tools";

const tool: ExternalTool = {
  def: {
    name: "search_stock",
    description: "Look up parts in stock.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, vehicle_make: { type: ["string", "null"] } },
      required: ["query"],
    },
  },
  endpointUrl: "https://spares.example/api/bookfront/tools/shop-1",
  secret: "s".repeat(40),
  promptNote: "",
};
const ctx = { tenantId: "tenant-1", conversationId: "convo-1", channel: "web" as const };

function okFetch(result: unknown = { result: "2 in stock" }) {
  return vi.fn(async () => new Response(JSON.stringify(result), { status: 200 })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cleanInput", () => {
  it("keeps declared fields only", () => {
    expect(cleanInput(tool.def, { query: "brake pads", tenantId: "someone-else" })).toEqual({
      ok: true,
      input: { query: "brake pads" },
    });
  });

  it("names missing or blank required fields", () => {
    for (const input of [{}, { query: "  " }, { query: null }]) {
      const result = cleanInput(tool.def, input);
      expect(result).toEqual({ ok: false, error: "Invalid input for search_stock: missing query." });
    }
  });

  it("rejects input that isn't an object (e.g. malformed argument JSON)", () => {
    for (const input of [undefined, null, "brake pads", ["brake pads"]]) {
      expect(cleanInput(tool.def, input).ok).toBe(false);
    }
  });
});

describe("callExternalTool", () => {
  it("posts the signed call and returns the result text", async () => {
    const fetchImpl = okFetch();
    const result = await callExternalTool(tool, { query: "brake pads", vehicle_make: "VW" }, ctx, fetchImpl);
    expect(result).toBe("2 in stock");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(tool.endpointUrl);
    expect(init.redirect).toBe("error");
    const body = init.body as string;
    expect(JSON.parse(body)).toEqual({
      tool: "search_stock",
      input: { query: "brake pads", vehicle_make: "VW" },
      tenantId: "tenant-1",
      conversationId: "convo-1",
      channel: "web",
    });
    const headers = init.headers as Record<string, string>;
    const expected = createHmac("sha256", tool.secret).update(`${headers["X-Bookfront-Timestamp"]}.${body}`).digest("hex");
    expect(headers["X-Bookfront-Signature"]).toBe(`sha256=${expected}`);
  });

  it("doesn't call the endpoint with invalid input", async () => {
    const fetchImpl = okFetch();
    expect(await callExternalTool(tool, {}, ctx, fetchImpl)).toContain("missing query");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("hides failures from the model", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = [
      vi.fn(async () => new Response("relation parts does not exist", { status: 500 })),
      vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 })),
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5");
      }),
    ];
    for (const fetchImpl of failing) {
      const result = await callExternalTool(tool, { query: "x" }, ctx, fetchImpl as unknown as typeof fetch);
      expect(result).toContain("technical problem");
      expect(result).not.toMatch(/relation|ECONNREFUSED|nope/);
    }
  });

  it("caps a long result", async () => {
    const result = await callExternalTool(tool, { query: "x" }, ctx, okFetch({ result: "a".repeat(5000) }));
    expect(result).toHaveLength(2000);
  });
});

describe("signExternalToolRequest", () => {
  it("changes with the timestamp, the body and the secret", () => {
    const base = signExternalToolRequest("secret", "100", "{}");
    expect(signExternalToolRequest("secret", "101", "{}")).not.toBe(base);
    expect(signExternalToolRequest("secret", "100", "{ }")).not.toBe(base);
    expect(signExternalToolRequest("other", "100", "{}")).not.toBe(base);
  });
});

describe("checkEndpoint", () => {
  it("accepts public https", () => {
    expect(checkEndpoint("https://spares.example/api/tools").hostname).toBe("spares.example");
  });

  it("refuses plain http, private addresses and junk", () => {
    for (const url of ["http://spares.example/api", "https://10.0.0.5/api", "https://169.254.169.254/", "not a url"]) {
      expect(() => checkEndpoint(url)).toThrow();
    }
  });

  it("allows localhost in development only", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(checkEndpoint("http://localhost:3001/api").port).toBe("3001");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => checkEndpoint("http://localhost:3001/api")).toThrow();
  });
});

describe("tool definitions", () => {
  it("rejects bad names and non-object parameter schemas", () => {
    const good = { name: "search_stock", description: "d", parameters: tool.def.parameters, endpoint_url: "https://a.example" };
    expect(externalToolSchema.safeParse(good).success).toBe(true);
    expect(externalToolSchema.safeParse({ ...good, name: "Search Stock" }).success).toBe(false);
    expect(externalToolSchema.safeParse({ ...good, parameters: { type: "string" } }).success).toBe(false);
  });

  it("knows the built-in names an external tool may not take", () => {
    expect(isBuiltInToolName("save_lead")).toBe(true);
    expect(isBuiltInToolName("search_stock")).toBe(false);
  });
});
