// Which LLM the agent talks to. Every provider here speaks the OpenAI-compatible
// chat-completions API, so model.ts only needs a base URL, a key and a model
// name; anything provider-specific lives in `extraBody`.
//
// Chosen per deployment with LLM_PROVIDER (default "groq") and optionally
// LLM_MODEL. The model-comparison script passes a target explicitly instead.

export const PROVIDERS = ["groq", "gemini", "openrouter", "cerebras"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

type ProviderSpec = {
  baseUrl: string;
  keyEnv: string;
  // null = LLM_MODEL must be set (no sensible default, e.g. OpenRouter).
  defaultModel: string | null;
  // Some providers only report token usage on a stream when asked to.
  askForUsage: boolean;
  extraBody: (model: string) => Record<string, unknown>;
};

const SPECS: Record<ProviderName, ProviderSpec> = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
    askForUsage: false,
    // gpt-oss reasons before answering, and those tokens count against
    // max_tokens: at the default effort a long turn could run out mid-thought
    // and leak half-formed reasoning into the reply. Low effort keeps it
    // short; include_reasoning:false keeps it out of the response entirely.
    extraBody: (model) => (model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", include_reasoning: false } : {}),
  },
  gemini: {
    // Google's OpenAI-compatible endpoint. Free-tier requests may be used by
    // Google to improve its products: test with made-up conversations only.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-flash-latest",
    askForUsage: true,
    // Flash "thinks" by default, and thinking tokens count against
    // max_tokens: low effort leaves room for the actual reply.
    extraBody: () => ({ reasoning_effort: "low" }),
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: null,
    askForUsage: true,
    extraBody: () => ({}),
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    defaultModel: "gpt-oss-120b",
    askForUsage: true,
    extraBody: (model) => (model.startsWith("gpt-oss") ? { reasoning_effort: "low" } : {}),
  },
};

export type LlmTarget = {
  provider: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
  askForUsage: boolean;
  extraBody: Record<string, unknown>;
};

export function isProvider(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

// Resolved at call time (not module load) so env changes and tests apply.
export function resolveLlm(provider?: string, model?: string): LlmTarget {
  // `||`, not `??`: an empty LLM_PROVIDER= line in a .env file means "not set".
  const name = provider ?? (process.env.LLM_PROVIDER || "groq");
  if (!isProvider(name)) {
    throw new Error(`Unknown LLM provider "${name}". Use one of: ${PROVIDERS.join(", ")}.`);
  }
  const spec = SPECS[name];
  // LLM_MODEL belongs to the deployment's provider, so it's ignored when a
  // provider is passed explicitly (e.g. by the comparison script).
  const chosenModel = model ?? (provider ? null : process.env.LLM_MODEL || null) ?? spec.defaultModel;
  if (!chosenModel) throw new Error(`Set LLM_MODEL to choose a model for ${name}.`);
  const apiKey = process.env[spec.keyEnv];
  if (!apiKey) throw new Error(`${spec.keyEnv} is not set (needed for ${name}).`);
  return {
    provider: name,
    model: chosenModel,
    baseUrl: spec.baseUrl,
    apiKey,
    askForUsage: spec.askForUsage,
    extraBody: spec.extraBody(chosenModel),
  };
}
