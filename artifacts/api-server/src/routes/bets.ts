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

    res.json(bets);
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
      return scoreOutcomeForSel(sel, result, ht) === "lost";
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
          outcome: scoreOutcomeForSel(sel, result, ht),
        };
      });
      await db.update(betsTable).set({ status: "lost", selections: updatedSelsLost }).where(eq(betsTable.id, bet.id));
      res.status(400).json({ error: "Boletim já tem uma seleção perdida — cash out indisponível" });
      return;
    }

    // Block cashout during active market suspension (VAR, golo, penálti, etc.)
    const liveSt = liveMatchState.get(bet.matchId);
    if (liveSt) {
      const now = Date.now();
      const suspended =
        (liveSt.marketSuspension != null &&
          Object.values(liveSt.marketSuspension).some(ts => ts > now)) ||
        !!liveSt._suspensionReason;
      if (suspended) {
        const reason = liveSt._suspensionReason ?? "LANCE CRÍTICO";
        res.status(400).json({ error: `Cash out suspenso — ${reason}. Aguarde e tente novamente.` });
        return;
      }
    }

    const stake        = parseFloat(bet.stake);
    const originalOdds = parseFloat(bet.totalOdds);

    // Current odds from live state, otherwise apply small drift
    let currentOdds = originalOdds;
    const liveMatch = liveMatchState.get(bet.matchId);
    if (liveMatch) {
      currentOdds = liveMatch.odds.home * liveMatch.odds.draw * liveMatch.odds.away;
      currentOdds = Math.max(1.05, currentOdds);
    } else {
      const drift = 1 + Math.random() * 0.2;
      currentOdds = Math.max(1.05, originalOdds * drift);
    }

    // cashoutValue = (stake × originalOdds) / currentOdds × 0.92  (8% house margin)
    const cashoutValue = Math.max(0, Number(((stake * originalOdds) / currentOdds * 0.92).toFixed(2)));
    const cashoutStr   = cashoutValue.toFixed(2);

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
