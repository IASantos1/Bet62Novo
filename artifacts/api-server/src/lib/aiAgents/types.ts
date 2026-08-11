// Shared types for the internal AI-operations agent system (CEO/Orchestrator,
// Risk, Odds, Settlement, Fraud, Payments, Compliance, Support). See
// client.ts for the model call and README-style notes on the design.

export const AGENT_ROLES = [
  "orchestrator",
  "risk",
  "odds",
  "settlement",
  "fraud",
  "payments",
  "compliance",
  "support",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(value);
}

// Action types a proposal can carry. Anything here that touches money or a
// compliance decision (withdrawals, account blocking, KYC, RTP/margin) is
// ALWAYS created with status "pending" and is only ever applied by
// executor.ts after POST /admin/ai-agents/proposals/:id/approve — this is a
// binding product decision (user request, 2026-08-11: "só propõe, humano
// aprova"), not a per-agent choice. There is no code path that lets an
// agent execute one of these directly.
export type ProposalActionType =
  | "approve_withdrawal"
  | "reject_withdrawal"
  | "approve_kyc"
  | "reject_kyc"
  | "block_account"
  | "unblock_account"
  | "annotate_review_queue"
  | "draft_support_reply"
  | "flag_for_human_review";

export interface ProposalDraft {
  actionType: ProposalActionType;
  targetType: "withdrawal" | "user" | "bet" | "kyc_document" | "match";
  targetId: string;
  summary: string;
  reasoning: string;
  riskLevel: "low" | "normal" | "high";
  payload?: Record<string, unknown>;
}

export interface AgentFinding {
  description: string;
  severity: "low" | "medium" | "high";
}

export interface AgentAnalysisResult {
  summary: string;
  findings: AgentFinding[];
  proposals: ProposalDraft[];
}
