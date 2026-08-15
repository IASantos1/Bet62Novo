import {
  db,
  betsTable,
  cashoutStatesTable,
  settlementLogsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { applyBalanceDelta, applyFreebetBalanceDelta } from "../../lib/ledger.js";
import { resolveSelectionOutcome } from "../../lib/settlementHelpers.js";
import {
  buildSettlementLogKey,
  computeResolvedTicketOdds,
  ensureSettlementTransitionIdempotency,
  type SelectionRecord,
  type SettlementOutcome,
} from "../../settlement.js";

export type SettleBetInput = {
  bet: any;
  trigger: string;
  selections: any[];
  cycleId: string;
  // Skips deriveSettlementDecision entirely and voids+refunds the bet
  // outright — used only by the Ticket Settlement Agent
  // (lib/aiAgents/roles/ticketSettlement.ts) for bets stuck "pending" long
  // after their match, where the deterministic engine can never produce a
  // won/lost outcome (no result data will ever arrive: abandoned/cancelled
  // event). Deliberately can only ever result in a stake refund, never a
  // win payout — an AI misjudgement here costs at most the house's own
  // margin on that bet, never someone else's money.
  forceVoidReason?: string;
};

type SettleBetTx = unknown;

export type SettleBetDeps = {
  logger: Pick<typeof logger, "info" | "warn" | "error">;
  transaction: <T>(run: (tx: SettleBetTx) => Promise<T>) => Promise<T>;
  ensureSettlementTransitionIdempotency: typeof ensureSettlementTransitionIdempotency;
  applyBalanceDelta: typeof applyBalanceDelta;
  applyFreebetBalanceDelta: typeof applyFreebetBalanceDelta;
  updatePendingBet: (
    tx: SettleBetTx,
    args: {
      betId: number;
      expectedVersion: number;
      status: "lost" | "voided" | "won";
      updatedSelections: SelectionRecord[];
      totalOdds?: string;
      payout: string;
    },
  ) => Promise<boolean>;
  clearCashoutState: (tx: SettleBetTx, betId: number) => Promise<void>;
  insertSettlementLog: (
    tx: SettleBetTx,
    args: {
      betId: number;
      userId: number;
      matchId?: string;
      trigger: string;
      status: "lost" | "voided" | "won";
      payout: string;
      message: string;
    },
  ) => Promise<void>;
};

const defaultSettleBetDeps: SettleBetDeps = {
  logger,
  transaction: (run) => db.transaction(run),
  ensureSettlementTransitionIdempotency,
  applyBalanceDelta,
  applyFreebetBalanceDelta,
  updatePendingBet: async (tx, args) => {
    const rows = await (tx as typeof db)
      .update(betsTable)
      .set({
        status: args.status,
        selections: args.updatedSelections as never,
        ...(args.totalOdds
          ? {
              totalOdds: args.totalOdds,
              potentialWin: args.payout,
            }
          : {}),
        updatedAt: new Date(),
        version: sql`${betsTable.version} + 1`,
      })
      .where(
        and(
          eq(betsTable.id, args.betId),
          eq(betsTable.status, "pending"),
          eq(betsTable.version, args.expectedVersion),
        ),
      )
      .returning({
        id: betsTable.id,
      });

    return rows.length > 0;
  },
  clearCashoutState: async (tx, betId) => {
    await (tx as typeof db)
      .delete(cashoutStatesTable)
      .where(eq(cashoutStatesTable.betId, betId));
  },
  insertSettlementLog: async (tx, args) => {
    await (tx as typeof db)
      .insert(settlementLogsTable)
      .values({
        settlementKey: buildSettlementLogKey({
          betId: args.betId,
          oldStatus: "pending",
          newStatus: args.status,
          event: args.trigger,
          matchId: args.matchId,
        }),
        betId: args.betId,
        userId: args.userId,
        oldStatus: "pending",
        newStatus: args.status,
        payout: args.payout,
        message: args.message,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  },
};

export type SettlementDecision =
  | {
      status: "pending";
      outcome: null;
      updatedSelections: SelectionRecord[];
      payout: "0.00";
      totalOdds?: undefined;
      message: string;
    }
  | {
      status: "lost" | "voided" | "won";
      outcome: "lost" | "void" | "won";
      updatedSelections: SelectionRecord[];
      payout: string;
      totalOdds?: string;
      message: string;
    };

function formatCurrency(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function summarizeResolvedOutcomes(outcomes: SettlementOutcome[]): string {
  const voidCount = outcomes.filter((outcome) => outcome === "void").length;
  const halfWonCount = outcomes.filter((outcome) => outcome === "half_won").length;
  const halfLostCount = outcomes.filter((outcome) => outcome === "half_lost").length;

  return `void=${voidCount}, half_won=${halfWonCount}, half_lost=${halfLostCount}`;
}

function normalizeSelections(selections: any[]): SelectionRecord[] {
  return Array.isArray(selections) ? (selections as SelectionRecord[]) : [];
}

// A freebet's stake is debited from freebetBalance at placement, never real
// balance — no real money was ever risked to place the bet itself. WIN
// payout is stake-inclusive (stake*odds), same as a real-money bet — see
// settlement.ts's freebetAwareWinPayout for the full history (2026-08-10
// audit found the exploit this used to guard against; 2026-08-15 explicit,
// informed platform-owner decision reverted it anyway). A freebet VOID
// still refunds the stake to freebetBalance rather than real balance —
// only WINS changed. This is the recovery/replay settlement path
// (jobs/settlementRecovery.ts, lib/replayEngine.ts) — kept consistent with
// the primary worker so a bet doesn't get treated differently depending on
// which path happens to settle it.
function isFreebetBet(bet: { isFreebet?: unknown }): boolean {
  return String(bet.isFreebet ?? "") === "true";
}

export function deriveSettlementDecision(
  bet: any,
  selections: SelectionRecord[],
): SettlementDecision {
  if (selections.length === 0) {
    return {
      status: "pending",
      outcome: null,
      updatedSelections: [],
      payout: "0.00",
      message: "Settlement skipped: bet has no selections",
    };
  }

  const finalResults = selections.map((selection) =>
    resolveSelectionOutcome(selection, bet.matchId, false),
  );
  const outcomes = finalResults.map((result) => result.outcome);
  const updatedSelections = finalResults.map((result) => result.updatedSel);

  // A single leg that's already definitively lost sinks the whole multiple
  // immediately — it must not wait on other legs that are still pending
  // (e.g. a tennis "correct score per set" leg that stays unresolved until
  // its set finishes). Checking this before the "any pending" branch below
  // is what makes early-loss cascade actually happen for multiples.
  if (outcomes.some((outcome) => outcome === "lost")) {
    return {
      status: "lost",
      outcome: "lost",
      updatedSelections,
      payout: "0.00",
      message: `engine-settled with losing leg(s): ${summarizeResolvedOutcomes(outcomes)}`,
    };
  }

  if (outcomes.some((outcome) => outcome === null)) {
    const pendingReasons = finalResults
      .filter((result) => result.outcome === null)
      .map((result) => `${result.normalizedKey}:${result.reason}`)
      .slice(0, 5);

    return {
      status: "pending",
      outcome: null,
      updatedSelections,
      payout: "0.00",
      message: `Settlement pending: ${pendingReasons.join(", ") || "unresolved selections"}`,
    };
  }

  if (outcomes.every((outcome) => outcome === "void")) {
    return {
      status: "voided",
      outcome: "void",
      updatedSelections,
      payout: formatCurrency(Number.parseFloat(String(bet.stake ?? "0"))),
      message: "engine-settled: all selections voided - stake refunded",
    };
  }

  const stakeNum = Number.parseFloat(String(bet.stake ?? "0"));
  const effectiveOdds = computeResolvedTicketOdds(updatedSelections, outcomes);
  // Stake-inclusive for freebet wins too — see isFreebetBet's own header
  // comment for why (explicit, informed platform-owner decision,
  // 2026-08-15, reverting the "stake not returned" convention).
  const rawPayout = stakeNum * effectiveOdds;
  const payout = formatCurrency(Math.max(0, Number(rawPayout.toFixed(2))));

  return {
    status: "won",
    outcome: "won",
    updatedSelections,
    payout,
    totalOdds: formatCurrency(Number(effectiveOdds.toFixed(2))),
    message: `engine-settled as win: ${summarizeResolvedOutcomes(outcomes)}`,
  };
}

function buildForcedVoidDecision(bet: any, selections: SelectionRecord[], reason: string): SettlementDecision {
  return {
    status: "voided",
    outcome: "void",
    updatedSelections: selections,
    payout: formatCurrency(Number.parseFloat(String(bet.stake ?? "0"))),
    message: `force-voided by ticket settlement agent: ${reason}`,
  };
}

export async function settleBet(
  input: SettleBetInput,
  deps: SettleBetDeps = defaultSettleBetDeps,
) {
  const { bet, trigger, selections, forceVoidReason } = input;
  const normalizedSelections = normalizeSelections(selections);
  const decision = forceVoidReason
    ? buildForcedVoidDecision(bet, normalizedSelections, forceVoidReason)
    : deriveSettlementDecision(bet, normalizedSelections);

  if (decision.status === "pending") {
    deps.logger.info(
      {
        betId: bet.id,
        trigger,
        message: decision.message,
      },
      "Settlement left pending",
    );
    return decision;
  }

  return deps.transaction(async (tx) => {
    const betStatus = decision.status;

    const canProceed = await deps.ensureSettlementTransitionIdempotency(tx, {
      betId: bet.id,
      trigger,
      oldStatus: "pending",
      newStatus: betStatus,
      matchId: bet.matchId,
    });

    if (!canProceed) {
      deps.logger.warn({ betId: bet.id }, "Settlement blocked by idempotency");
      return;
    }

    const updated = await deps.updatePendingBet(tx, {
      betId: bet.id,
      expectedVersion: bet.version,
      status: betStatus,
      updatedSelections: decision.updatedSelections,
      totalOdds: decision.totalOdds,
      payout: decision.payout,
    });

    if (!updated) {
      deps.logger.warn(
        { betId: bet.id },
        "Optimistic lock failed (already processed)"
      );
      return;
    }

    await deps.clearCashoutState(tx, bet.id);

    if (decision.outcome === "won") {
      // A freebet win still pays real money — just winnings only, stake
      // excluded (decision.payout already reflects that, computed in
      // deriveSettlementDecision above). Always credits real balance; only
      // the amount differs for a freebet, never whether to credit at all.
      if (Number(decision.payout) > 0) {
        await deps.applyBalanceDelta(tx, {
          userId: bet.userId,
          amount: decision.payout,
          kind: "bet_settlement_payout",
          idempotencyKey: `bet:${bet.id}:settlement:payout`,
          refType: "bet",
          refId: String(bet.id),
        });
      }
    }

    if (decision.outcome === "void") {
      const applyVoidRefund = isFreebetBet(bet)
        ? deps.applyFreebetBalanceDelta
        : deps.applyBalanceDelta;
      await applyVoidRefund(tx, {
        userId: bet.userId,
        amount: decision.payout,
        kind: isFreebetBet(bet)
          ? "bet_settlement_void_refund_freebet"
          : "bet_settlement_void_refund",
        idempotencyKey: `bet:${bet.id}:settlement:void_refund`,
        refType: "bet",
        refId: String(bet.id),
      });
    }

    await deps.insertSettlementLog(tx, {
      betId: bet.id,
      userId: bet.userId,
      matchId: bet.matchId,
      trigger,
      status: betStatus,
      payout: decision.payout,
      message: decision.message,
    });

    deps.logger.info(
      {
        betId: bet.id,
        outcome: decision.outcome,
        trigger,
        betStatus,
      },
      "Bet settled successfully"
    );

    return decision;
  });
}
