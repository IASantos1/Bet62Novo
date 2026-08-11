// Shared LLM caller for the internal AI-operations agent system. Talks to
// any OpenAI-compatible chat-completions endpoint (POST {baseUrl}/chat/
// completions, { model, messages, ... } in, choices[0].message.content
// out) rather than a specific vendor's SDK/API shape — user request,
// 2026-08-11: run this system on a free/open-source model instead of a
// paid one, without needing to self-host a GPU server. CONFIG.AI_AGENTS_*
// (config.ts) defaults to OpenRouter, which fronts open-source models
// (Llama, Qwen, GPT-OSS, ...) behind that same protocol, including a
// genuinely free ":free" tier — but this same code works unchanged against
// Groq, Together AI, or a self-hosted Ollama/vLLM server later by just
// changing AI_AGENTS_BASE_URL/AI_AGENTS_MODEL/AI_AGENTS_API_KEY. (Not to be
// confused with the unrelated Anthropic-specific call in routes/admin.ts's
// POST /casino/banners/ai-generate, which this does not touch.)
//
// Every agent role gets the same strict JSON response contract
// (RESPONSE_CONTRACT below) so this module can validate and normalize the
// output once, in one place, instead of every role re-implementing parsing.
// A response the model can't produce validly, or any failure to reach the
// API at all, returns null — callers log/record the run as failed rather
// than guessing at a fallback (unlike the banner-copy generator, there is
// no safe deterministic template for "what should the Risk agent
// conclude"). parseAgentResponse below already tolerates a model wrapping
// its JSON in a ```json fence or adding stray prose around it (extracts
// the outermost {...}), which matters more here than it did with Claude —
// smaller open models follow "JSON only" instructions less reliably.
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type { AgentAnalysisResult, AgentFinding, AgentRole, ProposalActionType, ProposalDraft } from "./types.js";

const VALID_ACTION_TYPES: readonly string[] = [
  "approve_withdrawal",
  "reject_withdrawal",
  "approve_kyc",
  "reject_kyc",
  "block_account",
  "unblock_account",
  "annotate_review_queue",
  "draft_support_reply",
  "flag_for_human_review",
  "finalize_bet_settlement",
  "suspend_event",
];
const VALID_TARGET_TYPES: readonly string[] = ["withdrawal", "user", "bet", "kyc_document", "match"];
const VALID_SEVERITY: readonly string[] = ["low", "medium", "high"];
const VALID_RISK: readonly string[] = ["low", "normal", "high"];

const RESPONSE_CONTRACT = `Responde APENAS com um objeto JSON válido, sem markdown, sem texto fora do JSON, exatamente neste formato:
{
  "summary": string (resumo da análise, 1-3 frases, em português europeu),
  "findings": [{ "description": string, "severity": "low"|"medium"|"high" }],
  "proposals": [{
    "actionType": "approve_withdrawal"|"reject_withdrawal"|"approve_kyc"|"reject_kyc"|"block_account"|"unblock_account"|"annotate_review_queue"|"draft_support_reply"|"flag_for_human_review"|"finalize_bet_settlement"|"suspend_event",
    "targetType": "withdrawal"|"user"|"bet"|"kyc_document"|"match",
    "targetId": string,
    "summary": string (curto, para um admin ler numa lista),
    "reasoning": string (porquê, com base apenas nos dados fornecidos),
    "riskLevel": "low"|"normal"|"high",
    "payload": object (dados extra necessários para aplicar a ação; pode ser {})
  }]
}
Se não houver nada a assinalar, devolve findings e proposals como arrays vazios — nunca inventes um problema para teres algo a dizer.
NUNCA inventes dados que não estão no contexto fornecido abaixo.
Cada proposta é apenas uma RECOMENDAÇÃO. Nenhuma proposta é aplicada automaticamente — só depois de um humano aprovar explicitamente.`;

export async function runAgentAnalysis(args: {
  role: AgentRole;
  roleSystemPrompt: string;
  contextData: unknown;
  maxTokens?: number;
}): Promise<AgentAnalysisResult | null> {
  if (!CONFIG.AI_AGENTS_API_KEY) {
    logger.warn({ role: args.role }, "[aiAgents] AI_AGENTS_API_KEY not set, skipping run");
    return null;
  }
  try {
    const resp = await fetch(`${CONFIG.AI_AGENTS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.AI_AGENTS_API_KEY}`,
        // OpenRouter-specific attribution headers — harmless no-ops on
        // other OpenAI-compatible providers (Groq/Together/self-hosted).
        "HTTP-Referer": "https://bet62.pt",
        "X-Title": "Bet62 IA Operações",
      },
      body: JSON.stringify({
        model: CONFIG.AI_AGENTS_MODEL,
        max_tokens: args.maxTokens ?? 2000,
        temperature: 0.2,
        messages: [
          { role: "system", content: `${args.roleSystemPrompt}\n\n${RESPONSE_CONTRACT}` },
          {
            role: "user",
            content: `Dados atuais para análise:\n${JSON.stringify(args.contextData, null, 2)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      logger.warn({ role: args.role, status: resp.status, body: await resp.text().catch(() => "") }, "[aiAgents] LLM call failed");
      return null;
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    return parseAgentResponse(args.role, text);
  } catch (err) {
    logger.warn({ err, role: args.role }, "[aiAgents] LLM call errored");
    return null;
  }
}

function parseAgentResponse(role: AgentRole, text: string): AgentAnalysisResult | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    logger.warn({ role, text: trimmed.slice(0, 500) }, "[aiAgents] Agent response had no JSON object");
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed.slice(start, end + 1));
  } catch (err) {
    logger.warn({ err, role, text: trimmed.slice(0, 500) }, "[aiAgents] Could not parse agent JSON response");
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const findings = Array.isArray(obj.findings) ? obj.findings.map(normalizeFinding).filter((f): f is AgentFinding => f !== null) : [];
  const proposals = Array.isArray(obj.proposals)
    ? obj.proposals
        .map(normalizeProposal)
        .filter((p): p is ProposalDraft => p !== null)
        .slice(0, 20) // safety cap — a single run should never mass-produce hundreds of proposals
    : [];

  return { summary, findings, proposals };
}

function normalizeFinding(f: unknown): AgentFinding | null {
  if (typeof f !== "object" || f === null) return null;
  const o = f as Record<string, unknown>;
  if (typeof o.description !== "string" || !o.description.trim()) return null;
  const severity = VALID_SEVERITY.includes(String(o.severity)) ? (o.severity as AgentFinding["severity"]) : "low";
  return { description: o.description, severity };
}

function normalizeProposal(p: unknown): ProposalDraft | null {
  if (typeof p !== "object" || p === null) return null;
  const o = p as Record<string, unknown>;
  if (typeof o.actionType !== "string" || !VALID_ACTION_TYPES.includes(o.actionType)) return null;
  if (typeof o.targetType !== "string" || !VALID_TARGET_TYPES.includes(o.targetType)) return null;
  const targetId = typeof o.targetId === "string" ? o.targetId : typeof o.targetId === "number" ? String(o.targetId) : "";
  if (!targetId) return null;
  if (typeof o.summary !== "string" || !o.summary.trim()) return null;
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) return null;
  const riskLevel = VALID_RISK.includes(String(o.riskLevel)) ? (o.riskLevel as ProposalDraft["riskLevel"]) : "normal";
  const payload = typeof o.payload === "object" && o.payload !== null ? (o.payload as Record<string, unknown>) : {};

  return {
    actionType: o.actionType as ProposalActionType,
    targetType: o.targetType as ProposalDraft["targetType"],
    targetId,
    summary: o.summary,
    reasoning: o.reasoning,
    riskLevel,
    payload,
  };
}
