import { db, betsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type PendingBetSettlement = {
  betId: number;
  userId: number;
  matchId: string;
  marketId?: string;
  selectionId?: string;
  odds?: number;
  selections: any[];
  status: string;
  version: number;
  stake: string;
  potentialWin: string;
};

export type PendingSelection = PendingBetSettlement;

export async function getPendingSelectionsByMatch(
  matchId: string,
): Promise<PendingBetSettlement[]> {
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

  return rows.map((bet) => {
    const selections = Array.isArray(bet.selections) ? bet.selections : [];
    const firstSelection =
      selections.find((selection) => selection && typeof selection === "object") ??
      null;

    return {
      betId: bet.betId,
      userId: bet.userId,
      matchId,
      marketId: firstSelection
        ? String(firstSelection.marketId ?? firstSelection.market ?? "")
        : undefined,
      selectionId: firstSelection
        ? String(firstSelection.selectionId ?? firstSelection.selection ?? "")
        : undefined,
      odds: firstSelection
        ? Number(firstSelection.odd ?? firstSelection.odds ?? 1)
        : undefined,
      selections,
      status: bet.status,
      version: bet.version,
      stake: bet.stake,
      potentialWin: bet.potentialWin,
    };
  });
}

export async function getPendingSelectionsByMarket(
  matchId: string,
  marketId: string,
): Promise<PendingBetSettlement[]> {
  const bets = await getPendingSelectionsByMatch(matchId);

  return bets.filter((bet) =>
    bet.selections.some(
      (selection) =>
        String(selection.marketId ?? selection.market ?? "") === marketId,
    ),
  );
}
