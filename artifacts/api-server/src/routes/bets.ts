import { Router, type IRouter, type Response } from "express";
import { db, betsTable, usersTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { liveMatchState, finishedMatchResults, type LiveMatchState } from "./matches";
import { scoreOutcomeForSel, type SelectionRecord } from "../settlement";

const router: IRouter = Router();

const MIN_STAKE  = 0.10;
const MAX_STAKE  = 2000.00;
const MIN_ODDS   = 1.01;
const MAX_ODDS   = 500.00;

type CashoutStatus = "available" | "suspended" | "locked" | "closed";

const CASHOUT_UNFAVORABLE_CYCLE_MS = 60000;
const CASHOUT_UNFAVORABLE_OPEN_MS = 15000;
const CASHOUT_ODDS_WORSE_MULT = 1.2;
const cashoutUnfavorableSince = new Map<string, number>();

function normalizeSelectionKey(sel: string): string {
  let s = sel;
  if      (s === "1x2-home")   s = "home";
  else if (s === "1x2-draw")   s = "draw";
  else if (s === "1x2-away")   s = "away";
  else if (/^tg-([ou][\d]+)$/.test(s))  s = s.slice(3);
  else if (s === "dc-12")      s = "homeOrAway";
  else if (s === "eg-0")       s = "eg-g0";
  else if (s === "eg-1")       s = "eg-g1";
  else if (s === "eg-2")       s = "eg-g2";
  else if (s === "eg-3")       s = "eg-g3";
  else if (s === "eg-4")       s = "eg-g4";
  else if (s === "eg-5p")      s = "eg-g5plus";
  return s;
}

function currentOddForSelection(sel: SelectionRecord, liveSt: LiveMatchState): number | null {
  const s = normalizeSelectionKey(String(sel.selection ?? ""));
  const m = (liveSt as { markets?: Record<string, unknown> }).markets as unknown as Record<string, unknown> | undefined;
  const mk = (m ?? {}) as unknown as {
    doubleChance?: { homeOrDraw?: number; awayOrDraw?: number; homeOrAway?: number };
    bothTeamsScore?: { yes?: number; no?: number };
    totalGoals?: Record<string, number>;
    handicap?: { homeMinusOne?: number; awayPlusOne?: number; homeMinusOneHalf?: number; awayPlusOneHalf?: number };
    halfTime?: { home?: number; draw?: number; away?: number };
    secondHalf?: { home?: number; draw?: number; away?: number };
    firstGoal?: { home?: number; noGoal?: number; away?: number };
    drawNoBet?: { home?: number; away?: number };
    asianTotals?: Record<string, number>;
    htft?: Record<string, number>;
    correctScore?: Record<string, number>;
    corners?: Record<string, number>;
    cards?: Record<string, number>;
    winToNil?: { home?: number; away?: number };
    cleanSheet?: { home?: number; away?: number };
    goalOddEven?: { odd?: number; even?: number };
    exactGoals?: Record<string, number>;
    btts1H?: { yes?: number; no?: number };
    btts2H?: { yes?: number; no?: number };
    toWinBothHalves?: { home?: number; away?: number };
    highestScoringHalf?: { first?: number; second?: number; equal?: number };
    htCorrectScore?: Record<string, number>;
    h2CorrectScore?: Record<string, number>;
    teamGoals?: Record<string, number>;
    tennisExtra?: Record<string, unknown>;
    volleyballExtra?: Record<string, unknown>;
    basketballExtra?: Record<string, unknown>;
    hockeyExtra?: Record<string, unknown>;
    etExtra?: Record<string, unknown>;
    penExtra?: Record<string, unknown>;
  };

  const odds1x2 = (liveSt as { odds?: { home?: number; draw?: number; away?: number } }).odds;
  if (s === "home") return Number.isFinite(odds1x2?.home) ? odds1x2!.home! : null;
  if (s === "draw") return Number.isFinite(odds1x2?.draw) ? odds1x2!.draw! : null;
  if (s === "away") return Number.isFinite(odds1x2?.away) ? odds1x2!.away! : null;

  if (s === "homeOrDraw" || s === "dc-hd") return Number.isFinite(mk.doubleChance?.homeOrDraw) ? mk.doubleChance!.homeOrDraw! : null;
  if (s === "awayOrDraw" || s === "dc-da") return Number.isFinite(mk.doubleChance?.awayOrDraw) ? mk.doubleChance!.awayOrDraw! : null;
  if (s === "homeOrAway" || s === "dc-ha") return Number.isFinite(mk.doubleChance?.homeOrAway) ? mk.doubleChance!.homeOrAway! : null;

  if (s === "bts-yes") return Number.isFinite(mk.bothTeamsScore?.yes) ? mk.bothTeamsScore!.yes! : null;
  if (s === "bts-no")  return Number.isFinite(mk.bothTeamsScore?.no)  ? mk.bothTeamsScore!.no!  : null;

  if (s === "goe-odd")  return Number.isFinite(mk.goalOddEven?.odd)  ? mk.goalOddEven!.odd!  : null;
  if (s === "goe-even") return Number.isFinite(mk.goalOddEven?.even) ? mk.goalOddEven!.even! : null;

  if (s === "wtn-h") return Number.isFinite(mk.winToNil?.home) ? mk.winToNil!.home! : null;
  if (s === "wtn-a") return Number.isFinite(mk.winToNil?.away) ? mk.winToNil!.away! : null;

  if (s === "cs-h") return Number.isFinite(mk.cleanSheet?.home) ? mk.cleanSheet!.home! : null;
  if (s === "cs-a") return Number.isFinite(mk.cleanSheet?.away) ? mk.cleanSheet!.away! : null;

  if (s === "dnb-home") return Number.isFinite(mk.drawNoBet?.home) ? mk.drawNoBet!.home! : null;
  if (s === "dnb-away") return Number.isFinite(mk.drawNoBet?.away) ? mk.drawNoBet!.away! : null;

  if (s === "hc-hm1")  return Number.isFinite(mk.handicap?.homeMinusOne) ? mk.handicap!.homeMinusOne! : null;
  if (s === "hc-ap1")  return Number.isFinite(mk.handicap?.awayPlusOne) ? mk.handicap!.awayPlusOne! : null;
  if (s === "hc-hm15") return Number.isFinite(mk.handicap?.homeMinusOneHalf) ? mk.handicap!.homeMinusOneHalf! : null;
  if (s === "hc-ap15") return Number.isFinite(mk.handicap?.awayPlusOneHalf) ? mk.handicap!.awayPlusOneHalf! : null;

  if (s === "ht-home") return Number.isFinite(mk.halfTime?.home) ? mk.halfTime!.home! : null;
  if (s === "ht-draw") return Number.isFinite(mk.halfTime?.draw) ? mk.halfTime!.draw! : null;
  if (s === "ht-away") return Number.isFinite(mk.halfTime?.away) ? mk.halfTime!.away! : null;

  if (s === "2h-home") return Number.isFinite(mk.secondHalf?.home) ? mk.secondHalf!.home! : null;
  if (s === "2h-draw") return Number.isFinite(mk.secondHalf?.draw) ? mk.secondHalf!.draw! : null;
  if (s === "2h-away") return Number.isFinite(mk.secondHalf?.away) ? mk.secondHalf!.away! : null;

  if (s === "fg-home") return Number.isFinite(mk.firstGoal?.home) ? mk.firstGoal!.home! : null;
  if (s === "fg-away") return Number.isFinite(mk.firstGoal?.away) ? mk.firstGoal!.away! : null;
  if (s === "fg-none") return Number.isFinite(mk.firstGoal?.noGoal) ? mk.firstGoal!.noGoal! : null;

  if (/^[ou]\d+$/.test(s)) {
    const n = parseInt(s.slice(1), 10);
    if (Number.isFinite(n)) {
      const asAsian = mk.asianTotals?.[s];
      if (Number.isFinite(asAsian)) return asAsian!;
      const key = `${s[0] === "o" ? "over" : "under"}${String(n).padStart(2, "0")}`;
      const v = mk.totalGoals?.[key];
      return Number.isFinite(v) ? v! : null;
    }
  }

  if (/^[ou]c\d+$/.test(s)) {
    const key = `${s[0]}${s.slice(2)}`;
    const v = mk.corners?.[key];
    return Number.isFinite(v) ? v! : null;
  }

  if (/^[ou]card\d+$/.test(s)) {
    const key = `${s[0]}${s.slice(5)}`;
    const v = mk.cards?.[key];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("htft-")) {
    const k = s.slice(5);
    const v = mk.htft?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("cs-")) {
    const k = s.slice(3);
    const v = mk.correctScore?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("htcs-")) {
    const k = s.slice(5);
    const v = mk.htCorrectScore?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("h2cs-")) {
    const k = s.slice(5);
    const v = mk.h2CorrectScore?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("eg-")) {
    const k = s.slice(3);
    const v = mk.exactGoals?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s === "b1h-yes") return Number.isFinite(mk.btts1H?.yes) ? mk.btts1H!.yes! : null;
  if (s === "b1h-no")  return Number.isFinite(mk.btts1H?.no)  ? mk.btts1H!.no!  : null;
  if (s === "b2h-yes") return Number.isFinite(mk.btts2H?.yes) ? mk.btts2H!.yes! : null;
  if (s === "b2h-no")  return Number.isFinite(mk.btts2H?.no)  ? mk.btts2H!.no!  : null;

  if (s === "wbh-h") return Number.isFinite(mk.toWinBothHalves?.home) ? mk.toWinBothHalves!.home! : null;
  if (s === "wbh-a") return Number.isFinite(mk.toWinBothHalves?.away) ? mk.toWinBothHalves!.away! : null;

  if (s === "hsf-1") return Number.isFinite(mk.highestScoringHalf?.first) ? mk.highestScoringHalf!.first! : null;
  if (s === "hsf-2") return Number.isFinite(mk.highestScoringHalf?.second) ? mk.highestScoringHalf!.second! : null;
  if (s === "hsf-e") return Number.isFinite(mk.highestScoringHalf?.equal) ? mk.highestScoringHalf!.equal! : null;

  if (s.startsWith("tgh-") || s.startsWith("tga-")) {
    const isHome = s.startsWith("tgh-");
    const dir = s.slice(4, 5);
    const n = s.slice(5);
    const k = `${isHome ? "home" : "away"}${dir === "o" ? "Over" : "Under"}${n}`;
    const v = mk.teamGoals?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (/^set[123]-(home|away)$/.test(s)) {
    const setNum = parseInt(s.slice(3, 4), 10);
    const side = s.endsWith("home") ? "home" : "away";
    const vt = mk.tennisExtra as unknown as Record<string, unknown> | undefined;
    const vv = mk.volleyballExtra as unknown as Record<string, unknown> | undefined;
    const key = setNum === 1 ? "firstSet" : `set${setNum}`;
    const t = (vt?.[key] as Record<string, unknown> | undefined)?.[side];
    const v = (vv?.[`set${setNum}`] as Record<string, unknown> | undefined)?.[side];
    const out = Number.isFinite(t as number) ? (t as number) : Number.isFinite(v as number) ? (v as number) : null;
    return out;
  }

  if (/^vs[123][ha]$/.test(s)) {
    const setNum = parseInt(s.slice(2, 3), 10);
    const side = s.endsWith("h") ? "home" : "away";
    const vv = mk.volleyballExtra as unknown as Record<string, unknown> | undefined;
    const v = (vv?.[`set${setNum}`] as Record<string, unknown> | undefined)?.[side];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^es-(h20|h21|a02|a12)$/.test(s)) {
    const vt = mk.tennisExtra as unknown as Record<string, unknown> | undefined;
    const v = (vt?.["exactSets"] as Record<string, unknown> | undefined)?.[s.slice(3)];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^vs-s(30|31|32|03|13|23)$/.test(s)) {
    const vv = mk.volleyballExtra as unknown as Record<string, unknown> | undefined;
    const v = (vv?.["exactScore"] as Record<string, unknown> | undefined)?.[s.slice(3)];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^q[1234]-(home|away)$/.test(s)) {
    const q = `q${s.slice(1, 2)}`;
    const side = s.endsWith("home") ? "home" : "away";
    const vb = mk.basketballExtra as unknown as Record<string, unknown> | undefined;
    const v = (vb?.[q] as Record<string, unknown> | undefined)?.[side];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^p[123]-(home|draw|away)$/.test(s)) {
    const p = `period${s.slice(1, 2)}`;
    const side = s.endsWith("home") ? "home" : s.endsWith("draw") ? "draw" : "away";
    const vh = mk.hockeyExtra as unknown as Record<string, unknown> | undefined;
    const v = (vh?.[p] as Record<string, unknown> | undefined)?.[side];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  return null;
}

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
        const k = normalizeSelectionKey(String(sel.selection ?? ""));
        if ((k === "home" || k === "homeOrDraw" || k === "dc-hd" || k === "dnb-home") && liveSt.homeScore < liveSt.awayScore) unfavorableReason = "Seleção está em desvantagem";
        if ((k === "away" || k === "awayOrDraw" || k === "dc-da" || k === "dnb-away") && liveSt.awayScore < liveSt.homeScore) unfavorableReason = "Seleção está em desvantagem";
      }
    }

    const baseOdd = Math.max(1.01, Number(sel.odd ?? 1.01));
    if (!liveSt) {
      currentOddsProduct *= baseOdd;
      continue;
    }

    const curOdd = currentOddForSelection(sel, liveSt);
    const useOdd = Number.isFinite(curOdd) && (curOdd as number) > 1.0 ? Math.max(1.01, curOdd as number) : baseOdd;
    currentOddsProduct *= useOdd;
    if (!unfavorableReason && Number.isFinite(curOdd) && (curOdd as number) >= baseOdd * CASHOUT_ODDS_WORSE_MULT) unfavorableReason = "Odds ficaram desfavoráveis";
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
