import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

// The internal AI-operations system (CEO/Orchestrator, Risk, Odds,
// Settlement, Fraud, Payments, Compliance, Support agents — see
// lib/aiAgents/*). Binding product constraint: any proposal whose
// actionType touches money or compliance (withdrawals, account
// blocking, KYC, margin/RTP) is NEVER auto-executed — it is only
// ever created here as "pending" and applied by executeProposal()
// (lib/aiAgents/executor.ts) after an admin calls the approve route.
export const aiAgentProposalsTable = pgTable("ai_agent_proposals", {
  id: serial("id").primaryKey(),
  agentRole: text("agent_role").notNull(),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  summary: text("summary").notNull(),
  reasoning: text("reasoning").notNull(),
  payload: jsonb("payload"),
  riskLevel: text("risk_level").notNull().default("normal"),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  executionError: text("execution_error"),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  runId: integer("run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiAgentRunsTable = pgTable("ai_agent_runs", {
  id: serial("id").primaryKey(),
  agentRole: text("agent_role").notNull(),
  trigger: text("trigger").notNull().default("manual"),
  triggeredBy: text("triggered_by"),
  status: text("status").notNull().default("ok"),
  summary: text("summary"),
  proposalsCreated: integer("proposals_created").notNull().default(0),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiAgentProposal = typeof aiAgentProposalsTable.$inferSelect;
export type InsertAiAgentProposal = typeof aiAgentProposalsTable.$inferInsert;
export type AiAgentRun = typeof aiAgentRunsTable.$inferSelect;
export type InsertAiAgentRun = typeof aiAgentRunsTable.$inferInsert;
