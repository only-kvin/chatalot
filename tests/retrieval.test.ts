import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRelevantKnowledge, reembedKnowledgeItem } from "../lib/agent/retrieval";

const INFO = [{ title: "Hours", content: "Tue-Sat 9-6" }];

// Records every call so tests can check what reached the database.
function fakeSupabase(chunks: { content: string }[] = []) {
  const calls: string[] = [];
  const query = {
    eq: () => query,
    then: (resolve: (v: unknown) => void) => resolve({ data: INFO }),
  };
  const client = {
    from: (table: string) => ({
      select: () => query,
      delete: () => (calls.push(`delete ${table}`), { eq: () => ({ eq: async () => ({}) }) }),
      insert: async () => (calls.push(`insert ${table}`), { error: null }),
    }),
    rpc: async () => (calls.push("rpc match_chunks"), { data: chunks, error: null }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function mockVoyage(ok: boolean) {
  vi.stubGlobal("fetch", async () =>
    ok
      ? new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }))
      : new Response("rate limited", { status: 429 }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("getRelevantKnowledge", () => {
  it("includes info items and matched chunks when search works", async () => {
    mockVoyage(true);
    const { client } = fakeSupabase([{ content: "Haircuts from R150" }]);
    const text = await getRelevantKnowledge(client, "t", "how much is a cut?");
    expect(text).toContain("Hours: Tue-Sat 9-6");
    expect(text).toContain("Haircuts from R150");
  });

  it("still returns info items when Voyage fails", async () => {
    mockVoyage(false);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = fakeSupabase();
    const text = await getRelevantKnowledge(client, "t", "what are your hours?");
    expect(text).toBe("Hours: Tue-Sat 9-6");
    expect(calls).not.toContain("rpc match_chunks");
    errors.mockRestore();
  });
});

describe("reembedKnowledgeItem", () => {
  it("keeps the old embedding when Voyage fails", async () => {
    mockVoyage(false);
    const { client, calls } = fakeSupabase();
    await expect(reembedKnowledgeItem(client, "t", "item", "text")).rejects.toThrow("429");
    expect(calls).toEqual([]);
  });

  it("replaces the embedding once the new one exists", async () => {
    mockVoyage(true);
    const { client, calls } = fakeSupabase();
    await reembedKnowledgeItem(client, "t", "item", "text");
    expect(calls).toEqual(["delete knowledge_chunks", "insert knowledge_chunks"]);
  });
});
