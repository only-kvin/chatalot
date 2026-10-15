// Provider adapter. This is the ONLY file that knows which LLM provider is behind
// the agent — everything else (engine.ts, prompt.ts, tools.ts) is provider-neutral.
//
// Currently: any OpenAI-compatible provider from providers.ts (Groq by default,
// free tier), called directly via fetch — no SDK dependency, since this is a
// temporary stand-in.
// TODO(Phase 1 follow-up): swap this file's internals for @anthropic-ai/sdk
// (claude-haiku-4-5-20251001, per the project spec) once Anthropic billing is set up.
// The exported `runAgentTurn` signature should stay the same so nothing else changes.

import { resolveLlm, type LlmTarget } from "./providers";
import type { ToolDef, ToolCall } from "./tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AgentTurnEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-executed"; call: ToolCall }
  | { type: "usage"; promptTokens: number; completionTokens: number };

// A cut + colour booking alone takes 4 tool calls (check availability and book,
// twice); a reschedule adds a lookup. 3 was too few: the forced text-only
// round then made the model call a tool anyway, which Groq rejects with 400.
const MAX_TOOL_ITERATIONS = 6;

// Told to the model on the forced text-only round, so it wraps up in words
// rather than attempting another tool call (which the provider would reject).
const FINAL_ROUND_NOTE =
  "You can't use any more tools in this reply. Reply to the visitor now in plain text: confirm only what the tool results above show was actually done, and say clearly what still needs doing.";

// Invisible characters the model sometimes emits (seen in a degenerate reply).
const INVISIBLE_CHARS = /[​-‍⁠﻿]/g;

function toOpenAiTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

type OpenAiMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type PendingCall = { id: string; name: string; args: string };

type StreamResult = {
  calls: PendingCall[];
  usage: { promptTokens: number; completionTokens: number };
};

async function streamOnce(
  target: LlmTarget,
  messages: OpenAiMessage[],
  tools: ToolDef[],
  maxTokens: number,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<StreamResult> {
  const body: Record<string, unknown> = {
    model: target.model,
    messages,
    max_tokens: maxTokens,
    stream: true,
    // Provider-specific settings, e.g. low reasoning effort (see providers.ts).
    ...target.extraBody,
  };
  if (target.askForUsage) body.stream_options = { include_usage: true };
  // Omit tools/tool_choice entirely (rather than an empty array) when this
  // call is forced text-only — some providers reject tool_choice with no tools.
  if (tools.length > 0) {
    body.tools = toOpenAiTools(tools);
    body.tool_choice = "auto";
  }

  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Aborting also cancels the in-flight body stream, so a stalled stream
    // rejects the pending reader.read() below rather than hanging.
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`${target.provider} API error ${res.status}: ${body}`);
  }

  const pending = new Map<number, PendingCall>();
  const usage = { promptTokens: 0, completionTokens: 0 };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") continue;

      const chunk = JSON.parse(data);
      if (chunk.error) {
        throw new Error(`${target.provider} stream error: ${chunk.error.message}`);
      }
      if (chunk.usage) {
        usage.promptTokens = chunk.usage.prompt_tokens ?? 0;
        usage.completionTokens = chunk.usage.completion_tokens ?? 0;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        const text = delta.content.replace(INVISIBLE_CHARS, "");
        if (text) onText(text);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = pending.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          pending.set(tc.index, existing);
        }
      }
    }
  }

  return { calls: [...pending.values()], usage };
}

// Malformed argument JSON becomes `undefined`, which the engine's input
// validation rejects with a message the model can correct from — rather than
// throwing and failing the whole turn.
function parseToolArgs(args: string): unknown {
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    return undefined;
  }
}

// Runs a full turn, including the tool-call/tool-result round trip: if the model
// calls a tool, `executeTool` runs it, its result is fed back as a proper OpenAI
// `role: "tool"` message, and the model is called again for its next response —
// up to MAX_TOOL_ITERATIONS times. One further call is then always forced with
// no tools available, guaranteeing a final text reply even if every tool-eligible
// iteration was spent calling tools (e.g. re-checking availability, then booking,
// leaves nothing left to say "you're booked" unless this final round exists).
export async function* runAgentTurn(params: {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  maxTokens: number;
  // Deadline for the whole turn; aborting it throws out of this generator.
  signal: AbortSignal;
  executeTool: (call: ToolCall) => Promise<string>;
  // Which provider and model to use; defaults to LLM_PROVIDER / LLM_MODEL.
  target?: LlmTarget;
  // Checked after each round of tools: true ends the turn there, skipping the
  // model's follow-up reply (and its tokens) when the tool result is the answer.
  endTurn?: () => boolean;
}): AsyncGenerator<AgentTurnEvent> {
  const target = params.target ?? resolveLlm();
  const openAiMessages: OpenAiMessage[] = [
    { role: "system", content: params.system },
    ...params.messages,
  ];

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    const finalRound = iteration === MAX_TOOL_ITERATIONS;
    const tools = finalRound ? [] : params.tools;
    let iterationText = "";
    const { calls: pendingCalls, usage } = await streamOnce(
      target,
      finalRound ? [...openAiMessages, { role: "system", content: FINAL_ROUND_NOTE }] : openAiMessages,
      tools,
      params.maxTokens,
      params.signal,
      (text) => {
        iterationText += text;
      },
    );

    yield { type: "usage", promptTokens: usage.promptTokens, completionTokens: usage.completionTokens };

    if (iterationText) yield { type: "text-delta", text: iterationText };

    if (pendingCalls.length === 0) return;

    openAiMessages.push({
      role: "assistant",
      content: iterationText || null,
      tool_calls: pendingCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args },
      })),
    });

    for (const call of pendingCalls) {
      const toolCall: ToolCall = { name: call.name, input: parseToolArgs(call.args) };
      const result = await params.executeTool(toolCall);
      yield { type: "tool-executed", call: toolCall };
      openAiMessages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    if (params.endTurn?.()) return;
  }
}
