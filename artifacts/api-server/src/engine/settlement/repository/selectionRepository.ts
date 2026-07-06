import { db, betsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export type PendingSelection = {
  betId: number;
  userId: number;
  matchId: string;
  marketId: string;
  selectionId: string;
  selections: any[];
  status: string;
  version: number;
  stake: string;
  potentialWin: string;
};

export async function getPendingSelectionsByMatch(
  matchId: string,
): Promise<PendingSelection[]> {
  const rows = await db
    .select({
      betId: betsTable.id,
      userId: betsTable.userId,
      matchId: betsTable.matchId,
      selections: betsTable.selections,
      status: betsTable.status,
      version: betsTable.version,
      stake: betsTable.stake,
      potentialWin: betsTable.potentialWin,
    })
    .from(betsTable)
    .where(
      and(
        eq(betsTable.matchId, matchId),
        eq(betsTable.status, "pending"),
      ),
    );

  const result: PendingSelection[] = [];

  for (const bet of rows) {
    const selections = Array.isArray(bet.selections)
      ? bet.selections
      : [];

    for (const selection of selections) {
      result.push({
        betId: bet.betId,
        userId: bet.userId,
        matchId,
        marketId: String(selection.marketId ?? ""),
        selectionId: String(selection.selectionId ?? ""),
        selections,
        status: bet.status,
        version: bet.version,
        stake: bet.stake,
        potentialWin: bet.potentialWin,
      });
    }
  }

  return result;
}

export async function getPendingSelectionsByMarket(
  matchId: string,
  marketId: string,
): Promise<PendingSelection[]> {
  const selections = await getPendingSelectionsByMatch(matchId);

  return selections.filter((s) => s.marketId === marketId);
}
