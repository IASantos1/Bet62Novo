import { db, betsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./lib/logger";
import { finishedMatchResults, scanDailyForFinished } from "./routes/matches";

type SelectionRecord = {
  matchId?: string;
  matchTitle?: string;
  selection: string;
  odd?: number;
  market?: string;
  label?: string;
};

/**
 * Evaluate a single bet selection against a known final score.
 * Mirrors the scoreOutcomeForSel function in home.tsx exactly.
 */
function scoreOutcomeForSel(
  sel: { selection: string },
  score: { home: number; away: number }
): "won" | "lost" | null {
  const s = sel.selection;
  const { home, away } = score;
  const total = home + away;
  let winning: boolean | null = null;
  if (s === "home")            winning = home > away;
  else if (s === "away")       winning = away > home;
  else if (s === "draw")       winning = home === away;
  else if (s === "homeOrDraw") winning = home >= away;
  else if (s === "awayOrDraw") winning = away >= home;
  else if (s === "homeOrAway") winning = home !== away;
  else if (s === "bts-yes")    winning = home > 0 && away > 0;
  else if (s === "bts-no")     winning = home === 0 || away === 0;
  else {
    const m = s.match(/^([ou])([\d.]+)$/);
    if (m) {
      const line = parseFloat(m[2]!);
      winning = m[1] === "o" ? total > line : total < line;
    }
  }
  return winning === null ? null : winning ? "won" : "lost";
}

/**
 * Find the result for a selection. Tries:
 * 1. sel.matchId (new bets — per-selection matchId)
 * 2. bet.matchId (single bets — matchId is the match directly)
 * 3. null (match not yet in finishedMatchResults; settle later)
 */
function findResult(
  sel: SelectionRecord,
  betMatchId: string,
  isSingle: boolean
): { home: number; away: number } | null {
  if (sel.matchId) {
    const r = finishedMatchResults.get(sel.matchId);
    if (r) return r;
  }
  if (isSingle) {
    const r = finishedMatchResults.get(betMatchId);
    if (r) return r;
  }
  return null;
}

/**
 * Scan all pending bets and settle those whose matches have finished.
 * Won bets credit potentialWin to the user's balance atomically.
 */
export async function autoSettlePendingBets(): Promise<void> {
  try {
    const pendingBets = await db
      .select()
      .from(betsTable)
      .where(eq(betsTable.status, "pending"));

    if (pendingBets.length === 0) return;

    let settled = 0;

    for (const bet of pendingBets) {
      try {
        const selections = bet.selections as SelectionRecord[];
        if (!Array.isArray(selections) || selections.length === 0) continue;

        const isSingle = selections.length === 1;
        const outcomes: Array<"won" | "lost" | null> = [];

        for (const sel of selections) {
          const result = findResult(sel, bet.matchId, isSingle);
          if (!result) {
            outcomes.push(null);
            continue;
          }
          outcomes.push(scoreOutcomeForSel(sel, result));
        }

        // Only settle when ALL selections have a resolved outcome
        if (outcomes.some(o => o === null)) continue;

        const allWon = outcomes.every(o => o === "won");
        const newStatus = allWon ? "won" : "lost";

        await db.transaction(async (tx) => {
          // Use optimistic locking: only update if still pending
          const rows = await tx
            .update(betsTable)
            .set({ status: newStatus })
            .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
            .returning({ id: betsTable.id });

          if (rows.length === 0) return; // already settled by another path

          if (allWon) {
            const [user] = await tx
              .select({ balance: usersTable.balance })
              .from(usersTable)
              .where(eq(usersTable.id, bet.userId))
              .limit(1);

            if (user) {
              const newBalance = (
                parseFloat(user.balance) + parseFloat(bet.potentialWin)
              ).toFixed(2);
              await tx
                .update(usersTable)
                .set({ balance: newBalance })
                .where(eq(usersTable.id, bet.userId));
            }
          }
        });

        logger.info(
          { betId: bet.id, userId: bet.userId, status: newStatus, potentialWin: bet.potentialWin },
          "Bet auto-settled"
        );
        settled++;
      } catch (err) {
        logger.error({ err, betId: bet.id }, "Error auto-settling bet");
      }
    }

    if (settled > 0) {
      logger.info({ settled }, "Auto-settlement cycle complete");
    }
  } catch (err) {
    logger.error({ err }, "Auto-settlement worker error");
  }
}

/**
 * Start the background settlement worker.
 * Runs a daily-feed scan + pending-bet settlement every 60 seconds.
 */
export function startSettlementWorker(): void {
  const run = async () => {
    await scanDailyForFinished();
    await autoSettlePendingBets();
  };

  // First run after a short delay so the server is fully ready
  setTimeout(() => { void run(); }, 5000);

  setInterval(() => { void run(); }, 60_000);

  logger.info("Bet auto-settlement worker started (60 s interval)");
}
