import {
  db,
  aiAgentProposalsTable,
  aiAgentRunsTable,
  type AiAgentProposal,
  type AiAgentRun,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import type { AgentRole, ProposalDraft } from "./types.js";

export async function recordRun(args: {
  role: AgentRole;
  trigger: "manual" | "orchestrator";
  triggeredBy?: string | null;
  status: "ok" | "error" | "skipped";
  summary?: string | null;
  proposalsCreated: number;
  errorMessage?: string | null;
  durationMs: number;
}): Promise<AiAgentRun> {
  const [run] = await db
    .insert(aiAgentRunsTable)
    .values({
      agentRole: args.role,
      trigger: args.trigger,
      triggeredBy: args.triggeredBy ?? null,
      status: args.status,
      summary: args.summary ?? null,
      proposalsCreated: args.proposalsCreated,
      errorMessage: args.errorMessage ?? null,
      durationMs: args.durationMs,
    })
    .returning();
  return run!;
}

export async function createProposals(
  role: AgentRole,
  runId: number,
  drafts: ProposalDraft[],
): Promise<AiAgentProposal[]> {
  if (drafts.length === 0) return [];
  const rows = await db
    .insert(aiAgentProposalsTable)
    .values(
      drafts.map((d) => ({
        agentRole: role,
        actionType: d.actionType,
        targetType: d.targetType,
        targetId: d.targetId,
        summary: d.summary,
        reasoning: d.reasoning,
        payload: d.payload ?? {},
        riskLevel: d.riskLevel,
        status: "pending" as const,
        runId,
      })),
    )
    .returning();
  return rows;
}

export async function listProposals(filters: { status?: string; role?: string }): Promise<AiAgentProposal[]> {
  const conditions = [];
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(aiAgentProposalsTable.status, filters.status));
  }
  if (filters.role && filters.role !== "all") {
    conditions.push(eq(aiAgentProposalsTable.agentRole, filters.role));
  }
  return db
    .select()
    .from(aiAgentProposalsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(aiAgentProposalsTable.createdAt))
    .limit(200);
}

export async function listRuns(limit = 50): Promise<AiAgentRun[]> {
  return db.select().from(aiAgentRunsTable).orderBy(desc(aiAgentRunsTable.createdAt)).limit(limit);
}

export async function getProposal(id: number): Promise<AiAgentProposal | null> {
  const [row] = await db.select().from(aiAgentProposalsTable).where(eq(aiAgentProposalsTable.id, id)).limit(1);
  return row ?? null;
}

export async function markProposalStatus(args: {
  id: number;
  status: "approved" | "rejected" | "executed" | "failed";
  reviewedBy?: string | null;
  executionError?: string | null;
}): Promise<AiAgentProposal | null> {
  const now = new Date();
  const [row] = await db
    .update(aiAgentProposalsTable)
    .set({
      status: args.status,
      reviewedBy: args.reviewedBy ?? undefined,
      reviewedAt: args.status === "approved" || args.status === "rejected" ? now : undefined,
      executedAt: args.status === "executed" ? now : undefined,
      executionError: args.executionError ?? null,
    })
    .where(eq(aiAgentProposalsTable.id, args.id))
    .returning();
  return row ?? null;
}
