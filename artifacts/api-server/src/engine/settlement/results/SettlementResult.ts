export type SettlementStatus =
  | "won"
  | "lost"
  | "void"
  | "halfwon"
  | "halflost"
  | "pending";

export interface SettlementResult {

  betId: number;

  userId: number;

  matchId: string;

  marketId: string;

  selectionId: string;

  status: SettlementStatus;

  payout: number;

  odds: number;

  stake: number;

  reason?: string;

  metadata?: Record<string, unknown>;

}
