import { Router, type IRouter, type Response } from "express";
import { db, betsTable, usersTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { liveMatchState, finishedMatchResults } from "./matches";
import { scoreOutcomeForSel, type SelectionRecord } from "../settlement";

const router: IRouter = Router();

const MIN_STAKE  = 0.10;
const MAX_STAKE  = 2000.00;
const MIN_ODDS   = 1.01;
const MAX_ODDS   = 500.00;

type CashoutStatus = "available" | "suspended" | "locked" | "closed";

const CASHOUT_UNFAVORABLE_CYCLE_MS = 60000;
const CASHOUT_UNFAVORABLE_OPEN_MS = 15000;
const cashoutUnfavorableSince = new Map<string, number>();

function getBetSelections(bet: { matchId: string; matchTitle: string; selections: unknown; totalOdds: string }): SelectionRecord[] {
  if (Array.isArray(bet.selections)) return bet.selections as SelectionRecord[];
  return [{ matchId: bet.matchId, matchTitle: bet.matchTitle, selection: "home", odd: parseFloat(bet.totalOdds), market: "result", label: "home" }];
}

function cashoutInfoForBet(bet: { id?: number | string; matchId: string; matchTitle: string; selections: unknown; stake: string; totalOdds: string; status: string }): {
  cashoutStatus: CashoutStatus;
  cashoutReason?: string;
  cashoutEstimate?: string;
} {
  if (bet.status !== "pending") {
    if (bet.id != null) cashoutUnfavorableSince.delete(String(bet.id));
    return { cashoutStatus: "closed" };
  }

  const now = Date.now();
  const selections = getBetSelections(bet);
  if (selections.length === 0) return { cashoutStatus: "locked", cashoutReason: "Sem seleções" };

  const stake = parseFloat(bet.stake);
  const originalOdds = parseFloat(bet.totalOdds);
  if (!Number.isFinite(stake) || !Number.isFinite(originalOdds) || stake <= 0 || originalOdds <= 0) {
    return { cashoutStatus: "locked", cashoutReason: "Dados inválidos" };
  }

  const betKey = bet.id != null ? String(bet.id) : `${bet.matchId}:${JSON.stringify(selections.map(s => [s.matchId, s.market, s.selection]))}`;
  let anyLive = false;
  let suspendedReason: string | null = null;
  let unfavorableReason: string | null = null;
  let currentOddsProduct = 1;

  for (const sel of selections) {
    const mId = sel.matchId;
    const liveSt = mId ? liveMatchState.get(String(mId)) : undefined;
    if (liveSt) {
      anyLive = true;
      const suspended =
        (liveSt.marketSuspension != null && Object.values(liveSt.marketSuspension).some(ts => ts > now)) ||
        !!liveSt._suspensionReason;
      if (suspended && !suspendedReason) suspendedReason = liveSt._suspensionReason ?? "LANCE CRÍTICO";

      if (!unfavorableReason && typeof liveSt.homeScore === "number" && typeof liveSt.awayScore === "number") {
        if (sel.selection === "home" && liveSt.homeScore < liveSt.awayScore) unfavorableReason = "Time selecionado está perdendo";
        if (sel.selection === "away" && liveSt.awayScore < liveSt.homeScore) unfavorableReason = "Time selecionado está perdendo";
      }
    }

    const baseOdd = Math.max(1.01, Number(sel.odd ?? 1.01));
    if (!liveSt) {
      currentOddsProduct *= baseOdd;
      continue;
    }

    if (sel.selection === "home" && liveSt.odds?.home) currentOddsProduct *= Math.max(1.01, liveSt.odds.home);
    else if (sel.selection === "away" && liveSt.odds?.away) currentOddsProduct *= Math.max(1.01, liveSt.odds.away);
    else if (sel.selection === "draw" && liveSt.odds?.draw) currentOddsProduct *= Math.max(1.01, liveSt.odds.draw);
    else currentOddsProduct *= baseOdd;
  }

  if (!anyLive) {
    cashoutUnfavorableSince.delete(betKey);
    return { cashoutStatus: "locked", cashoutReason: "Sem dados ao vivo" };
  }
  if (suspendedReason) return { cashoutStatus: "suspended", cashoutReason: suspendedReason };

  if (unfavorableReason) {
    const since = cashoutUnfavorableSince.get(betKey) ?? now;
    if (!cashoutUnfavorableSince.has(betKey)) cashoutUnfavorableSince.set(betKey, since);
    const elapsed = Math.max(0, now - since);
    const open = (elapsed % CASHOUT_UNFAVORABLE_CYCLE_MS) < CASHOUT_UNFAVORABLE_OPEN_MS;
    if (!open) return { cashoutStatus: "suspended", cashoutReason: unfavorableReason };
  } else {
    cashoutUnfavorableSince.delete(betKey);
  }

  const estimate = Math.max(0, Number(((stake * originalOdds) / Math.max(1.01, currentOddsProduct) * 0.92).toFixed(2)));
  return { cashoutStatus: "available", cashoutEstimate: estimate.toFixed(2) };
}

// ─── POST /api/bets/place ─────────────────────────────────────────────────────
router.post("/place", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { matchId, matchTitle, selections, stake, totalOdds, isFreebet } = req.body;
  // potentialWin is intentionally NOT read from req.body — always recalculated server-side

  if (!matchId || !matchTitle || !selections || !stake || !totalOdds) {
    res.status(400).json({ error: "Missing bet details" });
    return;
  }

  const betStake = parseFloat(stake);
  const betOdds  = parseFloat(totalOdds);

  if (!Number.isFinite(betStake) || betStake < MIN_STAKE || betStake > MAX_STAKE) {
    res.status(400).json({ error: `Valor de aposta inválido. Mínimo €${MIN_STAKE.toFixed(2)}, máximo €${MAX_STAKE.toFixed(2)}.` });
    return;
  }
  if (!Number.isFinite(betOdds) || betOdds < MIN_ODDS || betOdds > MAX_ODDS) {
    res.status(400).json({ error: "Odds inválidas. Fora do intervalo permitido." });
    return;
  }

  // Server-side recalculation of potentialWin — never trust the client value
  const potentialWin = (betStake * betOdds).toFixed(2);
  const stakeStr     = betStake.toFixed(2);
  const oddsStr      = betOdds.toFixed(2);

  // Reject bets on matches that have already finished
  if (finishedMatchResults.has(matchId)) {
    res.status(400).json({ error: "Este jogo já terminou. Aposta não aceite." });
    return;
  }

  const useFreebets = isFreebet === true;

  try {
    const result = await db.transaction(async (tx) => {
      if (useFreebets) {
        // Atomic freebet deduction — check AND deduct in a single SQL statement
        // to prevent race conditions from concurrent requests
        const updated = await tx
          .update(usersTable)
          .set({ freebetBalance: sql`${usersTable.freebetBalance} - ${stakeStr}::numeric` })
          .where(and(
            eq(usersTable.id, req.user!.id),
            sql`${usersTable.freebetBalance}::numeric >= ${stakeStr}::numeric`,
          ))
          .returning({ freebetBalance: usersTable.freebetBalance });

        if (updated.length === 0) {
          throw Object.assign(new Error("Saldo de freebets insuficiente"), { status: 400 });
        }

        const [bet] = await tx.insert(betsTable).values({
          userId: req.user!.id,
          matchId,
          matchTitle,
          selections,
          stake: stakeStr,
          potentialWin,
          totalOdds: oddsStr,
          status: "pending",
        }).returning();

        return { bet, newFbBalance: updated[0]!.freebetBalance };
      } else {
        // Atomic balance deduction — check AND deduct in one SQL statement,
        // preventing race conditions when multiple requests arrive simultaneously
        const updated = await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} - ${stakeStr}::numeric` })
          .where(and(
            eq(usersTable.id, req.user!.id),
            sql`${usersTable.balance}::numeric >= ${stakeStr}::numeric`,
          ))
          .returning({ balance: usersTable.balance });

        if (updated.length === 0) {
          throw Object.assign(new Error("Saldo insuficiente"), { status: 400 });
        }

        const [bet] = await tx.insert(betsTable).values({
          userId: req.user!.id,
          matchId,
          matchTitle,
          selections,
          stake: stakeStr,
          potentialWin,
          totalOdds: oddsStr,
          status: "pending",
        }).returning();

        return { bet, newBalance: updated[0]!.balance };
      }
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    logger.error({ err }, "Bet placement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/bets/my ─────────────────────────────────────────────────────────
router.get("/my", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bets = await db.select().from(betsTable)
      .where(eq(betsTable.userId, req.user!.id))
      .orderBy(desc(betsTable.createdAt));

    res.json(bets.map(b => {
      const info = cashoutInfoForBet(b as unknown as { id: number | string; matchId: string; matchTitle: string; selections: unknown; stake: string; totalOdds: string; status: string });
      return { ...b, ...info };
    }));
  } catch (err) {
    logger.error({ err }, "Fetch bets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/bets/:id/cashout ───────────────────────────────────────────────
router.post("/:id/cashout", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const betId = parseInt(String(req.params["id"]), 10);

  if (isNaN(betId)) {
    res.status(400).json({ error: "Invalid bet ID" });
    return;
  }

  try {
    const [bet] = await db.select().from(betsTable)
      .where(and(eq(betsTable.id, betId), eq(betsTable.userId, req.user!.id)))
      .limit(1);

    if (!bet) {
      res.status(404).json({ error: "Bet not found" });
      return;
    }

    if (bet.status !== "pending") {
      res.status(400).json({ error: "Bet is not eligible for cash out" });
      return;
    }

    // ── Block cash out if any leg is already lost (real-time check, before
    //    the 60-second settlement worker has a chance to run) ──────────────
    const selRecs = (bet.selections as SelectionRecord[]) ?? [];
    const isSingleLeg = selRecs.length === 1;
    const hasLostLeg = selRecs.some(sel => {
      const mId = sel.matchId ?? (isSingleLeg ? bet.matchId : undefined);
      if (!mId) return false;
      const result = finishedMatchResults.get(mId);
      if (!result) return false;
      const ht =
        typeof result.htHome === "number" && typeof result.htAway === "number"
          ? { htHome: result.htHome, htAway: result.htAway }
          : undefined;
      return scoreOutcomeForSel(sel, result, ht, {
        cornersTotal: result.cornersTotal,
        cardsTotal: result.cardsTotal,
        firstGoal: result.firstGoal,
        extras: result.extras,
      }) === "lost";
    });
    if (hasLostLeg) {
      const updatedSelsLost = selRecs.map(sel => {
        const mId = sel.matchId ?? (isSingleLeg ? bet.matchId : undefined);
        if (!mId) return sel;
        const result = finishedMatchResults.get(mId);
        if (!result) return sel;
        const ht =
          typeof result.htHome === "number" && typeof result.htAway === "number"
            ? { htHome: result.htHome, htAway: result.htAway }
            : undefined;
        return {
          ...sel,
          finalScore: { home: result.home, away: result.away },
          htScore: ht,
          outcome: scoreOutcomeForSel(sel, result, ht, {
            cornersTotal: result.cornersTotal,
            cardsTotal: result.cardsTotal,
            firstGoal: result.firstGoal,
            extras: result.extras,
          }),
        };
      });
      await db.update(betsTable).set({ status: "lost", selections: updatedSelsLost }).where(eq(betsTable.id, bet.id));
      res.status(400).json({ error: "Boletim já tem uma seleção perdida — cash out indisponível" });
      return;
    }

    const info = cashoutInfoForBet(bet as unknown as { id: number | string; matchId: string; matchTitle: string; selections: unknown; stake: string; totalOdds: string; status: string });
    if (info.cashoutStatus !== "available" || !info.cashoutEstimate) {
      const reason = info.cashoutStatus === "suspended"
        ? `Cash out suspenso — ${info.cashoutReason ?? "LANCE CRÍTICO"}. Aguarde e tente novamente.`
        : "Cash out indisponível no momento.";
      res.status(400).json({ error: reason });
      return;
    }

    const cashoutStr = info.cashoutEstimate;
    const cashoutValue = parseFloat(cashoutStr);

    const result = await db.transaction(async (tx) => {
      // Atomic cashout — prevent double cashout via concurrent requests
      // by making status = 'cashed_out' only if still 'pending'
      const updatedBet = await tx
        .update(betsTable)
        .set({ status: "cashed_out", cashoutValue: cashoutStr })
        .where(and(eq(betsTable.id, betId), eq(betsTable.status, "pending")))
        .returning({ id: betsTable.id });

      if (updatedBet.length === 0) {
        throw Object.assign(new Error("Bet is not eligible for cash out"), { status: 400 });
      }

      // Atomic balance credit using SQL addition (no read-then-write race)
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${cashoutStr}::numeric` })
        .where(eq(usersTable.id, req.user!.id));

      return { cashoutValue };
    });

    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    if (e.status === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    logger.error({ err }, "Cashout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
