import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { runAgentTurn } from "../lib/agent/model";
import { resolveLlm } from "../lib/agent/providers";

// fetch is mocked below; the provider only needs some key to be set.
beforeEach(() => {
  vi.stubEnv("LLM_PROVIDER", "");
  vi.stubEnv("LLM_MODEL", "");
  vi.stubEnv("GROQ_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolveLlm", () => {
  it("defaults to Groq gpt-oss-120b with low reasoning effort (empty env values count as unset)", () => {
    const t = resolveLlm();
    expect(t.provider).toBe("groq");
    expect(t.model).toBe("openai/gpt-oss-120b");
    expect(t.extraBody).toEqual({ reasoning_effort: "low", include_reasoning: false });
  });

  it("follows LLM_PROVIDER and LLM_MODEL", () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("LLM_MODEL", "gemini-test");
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    const t = resolveLlm();
    expect(t.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(t.model).toBe("gemini-test");
    expect(t.apiKey).toBe("g-key");
  });

  it("an explicit provider ignores LLM_MODEL (that belongs to the deployment's provider)", () => {
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-120b");
    vi.stubEnv("CEREBRAS_API_KEY", "c-key");
    expect(resolveLlm("cerebras").model).toBe("gpt-oss-120b");
  });

  it("refuses unknown providers, missing keys, and OpenRouter without a model", () => {
    expect(() => resolveLlm("nope")).toThrow(/Unknown LLM provider/);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(() => resolveLlm("gemini")).toThrow(/GEMINI_API_KEY is not set/);
    vi.stubEnv("OPENROUTER_API_KEY", "o-key");
    expect(() => resolveLlm("openrouter")).toThrow(/Set LLM_MODEL/);
  });
});

function sse(...chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body);
}

// A model that always wants another tool while tools are offered — like the
// cut + colour booking that crashed with "Tool choice is none".
function greedyModel() {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (body.tools) {
      return sse({
        choices: [{ delta: { tool_calls: [{ index: 0, id: `c${requests.length}`, function: { name: "check_availability", arguments: "{}" } }] } }],
      });
    }
    return sse({ choices: [{ delta: { content: "Done​ what I could." } }] });
  });
  return requests;
}

describe("runAgentTurn", () => {
  it("ends a long tool chain with a text-only round that tells the model to wrap up", async () => {
    const requests = greedyModel();
    const executed: string[] = [];
    let text = "";

    for await (const event of runAgentTurn({
      system: "sys",
      messages: [{ role: "user", content: "book a cut and a colour" }],
      tools: [{ name: "check_availability", description: "d", parameters: { type: "object", properties: {}, required: [] } }],
      maxTokens: 400,
      signal: new AbortController().signal,
      executeTool: async (call) => (executed.push(call.name), "ok"),
    })) {
      if (event.type === "text-delta") text += event.text;
    }

    expect(executed).toHaveLength(6);
    const final = requests.at(-1)!;
    expect(final.tools).toBeUndefined();
    const messages = final.messages as { role: string; content: string }[];
    expect(messages.at(-1)).toMatchObject({ role: "system" });
    expect(messages.at(-1)!.content).toContain("can't use any more tools");
    // Invisible characters are stripped from what reaches the customer.
    expect(text).toBe("Done what I could.");
  });

  it("keeps reasoning short and out of the reply", async () => {
    const requests = greedyModel();
    const turn = runAgentTurn({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      maxTokens: 400,
      signal: new AbortController().signal,
      executeTool: async () => "ok",
    });
    for await (const _ of turn) void _;
    expect(requests[0]).toMatchObject({ reasoning_effort: "low", include_reasoning: false });
  });
});
