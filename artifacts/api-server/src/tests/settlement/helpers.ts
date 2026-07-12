import type { SelectionRecord } from "../../settlement.js";

export type FinishedSettlementCase = {
  name: string;
  selection: SelectionRecord;
  ft: { home: number; away: number };
  ht?: { htHome: number; htAway: number };
  extra?: {
    status?: string;
    cornersTotal?: number;
    cardsTotal?: number;
    firstGoal?: "home" | "away" | "none";
    extras?: unknown;
    finishedAt?: number;
    providerSport?: string;
    winner?: "home" | "away" | null;
  };
  expected: "won" | "lost" | "void" | "half_won" | "half_lost" | null;
};

export type LiveSettlementCase = {
  name: string;
  selection: SelectionRecord;
  score: any;
  expected: "won" | "lost" | null;
};

export function makeSelection(
  selection: string,
  overrides: Partial<SelectionRecord> = {},
): SelectionRecord {
  return {
    matchId: "test-match",
    selection,
    odd: 2,
    ...overrides,
  };
}
