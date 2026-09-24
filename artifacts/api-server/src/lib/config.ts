// Optional — powers the admin "AI-assisted casino banner" copy generator
// (routes/admin.ts POST /casino/banners/ai-generate) only. Falls back to a
// deterministic template when unset. Kept separate from the AI_AGENTS_*
// vars below on purpose: the banner generator and the ops-agent system are
// unrelated features that happen to have both used Anthropic at first —
// they no longer have to share a provider.
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? "";

// The internal AI-operations agent system (Risk/Odds/Settlement/Fraud/
// Payments/Compliance/Support/Orchestrator/Ao Vivo/Pré-Jogo — see
// lib/aiAgents/). Deliberately NOT tied to Anthropic — user request,
// 2026-08-11: run this on a free/open-source model instead of a paid
// one, without needing to self-host a GPU server. Talks to any
// OpenAI-compatible chat-completions endpoint (client.ts), so the default
// below points at OpenRouter, which fronts open-source models (Llama,
// Qwen, GPT-OSS, ...) including a genuinely free ":free" tier — but the
// same code works unchanged against Groq, Together AI, or a self-hosted
// Ollama/vLLM server later by just changing these two vars.
const AI_AGENTS_API_KEY = process.env["AI_AGENTS_API_KEY"] ?? "";
const AI_AGENTS_BASE_URL =
  process.env["AI_AGENTS_BASE_URL"]?.trim() || "https://openrouter.ai/api/v1";
// meta-llama/llama-3.3-70b-instruct:free — a 70B model, not a tiny 7-8B
// one, specifically because these agents reason over real financial/
// compliance data and need to reliably follow the strict JSON contract in
// client.ts. OpenRouter's free-tier roster changes over time (verify at
// openrouter.ai/models) and free models are capped at 20 req/min and
// 50 req/day with no credits purchased (1,000/day after a one-time $10
// credit purchase) — the agents are meant to be run on demand from the
// admin panel, not on a tight schedule, to stay well under that.
const AI_AGENTS_MODEL =
  process.env["AI_AGENTS_MODEL"]?.trim() || "meta-llama/llama-3.3-70b-instruct:free";

const BIGBANG_API_KEY = process.env["BIGBANG_API_KEY"] ?? "";
const WINHOUSE_WALLET_API_KEY = process.env["WINHOUSE_WALLET_API_KEY"] ?? "";
const WINHOUSE_CALLBACK_TOKEN = process.env["WINHOUSE_CALLBACK_TOKEN"] ?? "";

export const CONFIG = {
  BIGBANG_API_KEY,
  WINHOUSE_WALLET_API_KEY,
  WINHOUSE_CALLBACK_TOKEN,
  ANTHROPIC_API_KEY,
  AI_AGENTS_API_KEY,
  AI_AGENTS_BASE_URL,
  AI_AGENTS_MODEL,
} as const;
