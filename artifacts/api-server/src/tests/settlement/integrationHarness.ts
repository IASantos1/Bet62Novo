import { buildSettlementLogKey, type SelectionRecord } from "../../settlement.js";
import {
  settleBet,
  type SettleBetDeps,
  type SettleBetInput,
} from "../../services/settlement/settleBet.js";
import type { PendingBetSettlement } from "../../engine/settlement/repository/selectionRepository.js";
import type { SettlementRecoveryDeps } from "../../jobs/settlementRecovery.js";
import type { SettlementWorkerDeps } from "../../engine/settlement/worker/settlementWorker.js";

type TestUser = {
  id: number;
  balance: string;
};

type TestBet = {
  id: number;
  userId: number;
  matchId: string;
  matchTitle: string;
  selections: SelectionRecord[];
  stake: string;
  potentialWin: string;
  totalOdds: string;
  isFreebet: string;
  status: string;
  kickoffTime: Date | null;
  cashoutValue: string | null;
  version: number;
  updatedAt: Date;
  createdAt: Date;
};

type TestCashoutState = {
  betId: number;
};

type TestLedgerEntry = {
  userId: number;
  amount: string;
  kind: string;
  idempotencyKey: string;
  refType?: string | null;
  refId?: string | null;
};

type TestSettlementLog = {
  settlementKey: string;
  betId: number;
  userId: number;
  oldStatus: string;
  newStatus: string;
  payout: string;
  message: string;
};

type HarnessState = {
  users: TestUser[];
  bets: TestBet[];
  cashoutStates: TestCashoutState[];
  ledgerEntries: TestLedgerEntry[];
  settlementLogs: TestSettlementLog[];
  settlementIdempotencyKeys: Set<string>;
  activeLocks: Set<number>;
  releasedLocks: Array<{ betId: number; owner: string }>;
  stoppedHeartbeats: unknown[];
};

type CreateHarnessInput = {
  users: TestUser[];
  bets: Array<
    Omit<TestBet, "isFreebet" | "kickoffTime" | "cashoutValue"> &
      Partial<Pick<TestBet, "isFreebet" | "kickoffTime" | "cashoutValue">>
  >;
  cashoutStates?: TestCashoutState[];
  now?: number;
  deniedLockBetIds?: number[];
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function formatCurrency(value: number): string {
  return value.toFixed(2);
}

function buildTransitionIdempotencyKey(args: {
  betId: number;
  trigger: string;
  oldStatus: string;
  newStatus: string;
  matchId?: string;
  jobId?: string;
}): string {
  return [
    "bet",
    String(args.betId),
    "trigger",
    args.trigger,
    "old",
    String(args.oldStatus ?? ""),
    "new",
    String(args.newStatus ?? ""),
    args.matchId ? `match:${String(args.matchId)}` : "",
    args.jobId ? `job:${String(args.jobId)}` : "",
  ]
    .filter(Boolean)
    .join(":");
}

function toPendingBetSettlement(bet: TestBet): PendingBetSettlement {
  const firstSelection =
    bet.selections.find((selection) => selection && typeof selection === "object") ??
    null;
  const selectionRecord = firstSelection as
    | (SelectionRecord & {
        marketId?: string;
        selectionId?: string;
        odds?: number;
      })
    | null;

  return {
    betId: bet.id,
    userId: bet.userId,
    matchId: bet.matchId,
    marketId: selectionRecord
      ? String(selectionRecord.marketId ?? selectionRecord.market ?? "")
      : undefined,
    selectionId: selectionRecord
      ? String(selectionRecord.selectionId ?? selectionRecord.selection ?? "")
      : undefined,
    odds: selectionRecord
      ? Number(selectionRecord.odd ?? selectionRecord.odds ?? 1)
      : undefined,
    selections: clone(bet.selections),
    status: bet.status,
    version: bet.version,
    stake: bet.stake,
    potentialWin: bet.potentialWin,
  };
}

export function createSettlementIntegrationHarness(input: CreateHarnessInput) {
  const nowValue = input.now ?? Date.parse("2026-01-01T12:00:00.000Z");
  const deniedLockBetIds = new Set(input.deniedLockBetIds ?? []);
  const state: HarnessState = {
    users: clone(input.users),
    bets: input.bets.map((bet) => ({
      isFreebet: "false",
      kickoffTime: null,
      cashoutValue: null,
      ...clone(bet),
    })),
    cashoutStates: clone(input.cashoutStates ?? []),
    ledgerEntries: [],
    settlementLogs: [],
    settlementIdempotencyKeys: new Set<string>(),
    activeLocks: new Set<number>(),
    releasedLocks: [],
    stoppedHeartbeats: [],
  };

  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };

  const settleBetDeps: SettleBetDeps = {
    logger,
    transaction: async (run) => run({ state }),
    ensureSettlementTransitionIdempotency: async (_tx, args) => {
      const key = buildTransitionIdempotencyKey(args);
      if (state.settlementIdempotencyKeys.has(key)) return false;
      state.settlementIdempotencyKeys.add(key);
      return true;
    },
    updatePendingBet: async (_tx, args) => {
      const bet = state.bets.find((item) => item.id === args.betId);

      if (!bet) return false;
      if (bet.status !== "pending") return false;
      if (bet.version !== args.expectedVersion) return false;

      bet.status = args.status;
      bet.selections = clone(args.updatedSelections);
      if (args.totalOdds) {
        bet.totalOdds = args.totalOdds;
        bet.potentialWin = args.payout;
      }
      bet.version += 1;
      bet.updatedAt = new Date(nowValue);
      return true;
    },
    clearCashoutState: async (_tx, betId) => {
      state.cashoutStates = state.cashoutStates.filter((item) => item.betId !== betId);
    },
    applyBalanceDelta: async (_tx, args) => {
      if (state.ledgerEntries.some((entry) => entry.idempotencyKey === args.idempotencyKey)) {
        return false;
      }

      const user = state.users.find((item) => item.id === args.userId);
      if (!user) {
        throw new Error(`User ${args.userId} not found`);
      }

      state.ledgerEntries.push({
        userId: args.userId,
        amount: args.amount,
        kind: args.kind,
        idempotencyKey: args.idempotencyKey,
        refType: args.refType,
        refId: args.refId,
      });

      user.balance = formatCurrency(
        Number.parseFloat(user.balance) + Number.parseFloat(args.amount),
      );

      return true;
    },
    insertSettlementLog: async (_tx, args) => {
      const settlementKey = buildSettlementLogKey({
        betId: args.betId,
        oldStatus: "pending",
        newStatus: args.status,
        event: args.trigger,
        matchId: args.matchId,
      });

      if (state.settlementLogs.some((entry) => entry.settlementKey === settlementKey)) {
        return;
      }

      state.settlementLogs.push({
        settlementKey,
        betId: args.betId,
        userId: args.userId,
        oldStatus: "pending",
        newStatus: args.status,
        payout: args.payout,
        message: args.message,
      });
    },
  };

  const settleBetWithHarness = (args: SettleBetInput) => settleBet(args, settleBetDeps);

  const workerDeps: SettlementWorkerDeps = {
    settleBet: settleBetWithHarness,
    getPendingSelectionsByMatch: async (matchId) =>
      state.bets
        .filter((bet) => bet.matchId === matchId && bet.status === "pending")
        .map(toPendingBetSettlement),
    logger,
    testMatchId: "match-1",
    now: () => nowValue,
  };

  const recoveryDeps: SettlementRecoveryDeps = {
    logger,
    settleBet: settleBetWithHarness,
    acquireBetSettlementLock: async (betId, owner) => {
      if (deniedLockBetIds.has(Number(betId)) || state.activeLocks.has(Number(betId))) {
        return { ok: false, heartbeat: null };
      }

      state.activeLocks.add(Number(betId));
      return {
        ok: true,
        heartbeat: { betId, owner },
      } as never;
    },
    releaseBetSettlementLock: async (betId, owner) => {
      state.activeLocks.delete(Number(betId));
      state.releasedLocks.push({ betId: Number(betId), owner });
    },
    stopSettlementLockHeartbeat: (heartbeat) => {
      state.stoppedHeartbeats.push(heartbeat);
    },
    listRecoverableBets: async (cutoff) =>
      state.bets
        .filter((bet) => bet.status === "pending" && bet.updatedAt < cutoff)
        .map((bet) => clone(bet)),
    recoveryThresholdMs: 3 * 60 * 60 * 1000,
    now: () => nowValue,
  };

  return {
    state,
    settleBetDeps,
    workerDeps,
    recoveryDeps,
    settleBet: settleBetWithHarness,
    getBet: (betId: number) => {
      const bet = state.bets.find((item) => item.id === betId);
      return bet ? clone(bet) : undefined;
    },
    getUser: (userId: number) => {
      const user = state.users.find((item) => item.id === userId);
      return user ? clone(user) : undefined;
    },
  };
}
