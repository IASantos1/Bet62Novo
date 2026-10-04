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

// Revolut Business API — automated payout of player withdrawals (routes/
// withdrawals.ts). REVOLUT_PRIVATE_KEY is the PEM private key whose public
// counterpart was uploaded to the Revolut Business API certificate config;
// it signs the JWT client-assertion used to redeem REVOLUT_REFRESH_TOKEN for
// short-lived access tokens (see services/revolut/client.ts). Unset
// REVOLUT_CLIENT_ID/REVOLUT_PRIVATE_KEY/REVOLUT_REFRESH_TOKEN disables
// auto-payout entirely — withdrawals then always fall back to the existing
// manual admin-approval flow.
const REVOLUT_ENVIRONMENT = (process.env["REVOLUT_ENVIRONMENT"]?.trim() || "sandbox") as
  | "sandbox"
  | "production";
const REVOLUT_CLIENT_ID = process.env["REVOLUT_CLIENT_ID"] ?? "";
// The domain/issuer configured against the certificate in Revolut Business
// → Settings → APIs → API Business when the key pair was uploaded. Required
// as the JWT client-assertion's `iss` claim — left as its own env var
// instead of guessing a value, since it's whatever was entered at setup.
const REVOLUT_JWT_ISSUER = process.env["REVOLUT_JWT_ISSUER"] ?? "";
const REVOLUT_PRIVATE_KEY = (process.env["REVOLUT_PRIVATE_KEY"] ?? "").replace(/\\n/g, "\n");
const REVOLUT_REFRESH_TOKEN = process.env["REVOLUT_REFRESH_TOKEN"] ?? "";
const REVOLUT_PAYOUT_ACCOUNT_ID = process.env["REVOLUT_PAYOUT_ACCOUNT_ID"] ?? "";
const REVOLUT_WEBHOOK_SIGNING_SECRET = process.env["REVOLUT_WEBHOOK_SIGNING_SECRET"] ?? "";
// User-confirmed bracket (2026-10-01): levantamentos entre estes dois
// valores (inclusive) são pagos automaticamente via Revolut, sem aprovação
// de admin; acima do máximo mantém-se a revisão manual existente.
const REVOLUT_AUTO_PAYOUT_MIN = Number(process.env["REVOLUT_AUTO_PAYOUT_MIN"]) || 20;
const REVOLUT_AUTO_PAYOUT_MAX = Number(process.env["REVOLUT_AUTO_PAYOUT_MAX"]) || 200;

// Casino bonus spins (see lib/casinoBonus.ts, routes/casino.ts). BigBang's
// API exposes no per-game minimum-bet field, so there is no way to verify
// a debit is "that slot's actual minimum" — instead, any single casino bet
// at or below this global cap is covered by the user's bonus spins (if any
// remain) instead of their real balance. User-confirmed (2026-10-01): a
// fixed global cap, not an admin-configurable one, for now.
const BONUS_SPIN_MAX_STAKE = Number(process.env["BONUS_SPIN_MAX_STAKE"]) || 0.2;

// Affiliate/promoter program defaults — see routes/affiliates.ts.
// AFFILIATE_DEFAULT_COMMISSION_RATE is the rate applied when POST
// /admin/affiliates doesn't specify one; per-affiliate rates are still
// individually configurable afterward from the admin panel.
const AFFILIATE_DEFAULT_COMMISSION_RATE =
  Number(process.env["AFFILIATE_DEFAULT_COMMISSION_RATE"]) || 10;
const AFFILIATE_COOKIE_DAYS = Number(process.env["AFFILIATE_COOKIE_DAYS"]) || 30;
const AFFILIATE_MINIMUM_PAYOUT = Number(process.env["AFFILIATE_MINIMUM_PAYOUT"]) || 20;

// Telegram channel publishing (lib/telegram/client.ts, routes/adminTelegram.ts).
// TELEGRAM_BOT_TOKEN is the bot created via @BotFather; the bot must be added
// to TELEGRAM_CHANNEL_ID (e.g. "@bet62oficial" or a numeric "-100..." id for
// a private channel) as an admin with permission to post messages. Either
// unset disables publishing — the admin endpoint then returns 503 instead of
// silently dropping the post.
const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TELEGRAM_CHANNEL_ID = process.env["TELEGRAM_CHANNEL_ID"] ?? "";

export const CONFIG = {
  BIGBANG_API_KEY,
  WINHOUSE_WALLET_API_KEY,
  WINHOUSE_CALLBACK_TOKEN,
  REVOLUT_ENVIRONMENT,
  REVOLUT_CLIENT_ID,
  REVOLUT_JWT_ISSUER,
  REVOLUT_PRIVATE_KEY,
  REVOLUT_REFRESH_TOKEN,
  REVOLUT_PAYOUT_ACCOUNT_ID,
  REVOLUT_WEBHOOK_SIGNING_SECRET,
  REVOLUT_AUTO_PAYOUT_MIN,
  REVOLUT_AUTO_PAYOUT_MAX,
  BONUS_SPIN_MAX_STAKE,
  ANTHROPIC_API_KEY,
  AI_AGENTS_API_KEY,
  AI_AGENTS_BASE_URL,
  AI_AGENTS_MODEL,
  AFFILIATE_DEFAULT_COMMISSION_RATE,
  AFFILIATE_COOKIE_DAYS,
  AFFILIATE_MINIMUM_PAYOUT,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID,
} as const;
