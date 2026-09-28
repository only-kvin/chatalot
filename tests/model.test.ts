import { describe, it, expect, vi, afterEach } from "vitest";
import { runAgentTurn } from "../lib/agent/model";

afterEach(() => vi.unstubAllGlobals());

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
