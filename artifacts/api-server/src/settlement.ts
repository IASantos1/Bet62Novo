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

type FTScore = { home: number; away: number };
type HTScore = { htHome: number; htAway: number };

/**
 * Evaluate a single bet selection against a known final score + optional HT score.
 * Returns "won" | "lost" | null  (null = data not available yet, or void/push bet).
 *
 * sel.selection key catalogue:
 *   FT: home | away | draw | homeOrDraw | awayOrDraw | homeOrAway
 *       dc-hd | dc-da | dc-ha  (alt double-chance keys)
 *       bts-yes | bts-no
 *       o{N} | u{N}   (total goals, e.g. o25 = over 2.5)
 *       goe-odd | goe-even
 *       wtn-h | wtn-a  (win to nil)
 *       cs-h | cs-a    (clean sheet)
 *       cs-{H}-{A}     (correct score FT)
 *       eg-g{N} | eg-g5plus  (exact total goals)
 *       dnb-home | dnb-away  (draw no bet — void on draw)
 *       tgh-{o|u}{N}   (home team goals O/U, e.g. tgh-o05)
 *       tga-{o|u}{N}   (away team goals O/U)
 *   HT-required: ht-home | ht-draw | ht-away
 *       b1h-yes | b1h-no
 *       htcs-{H}-{A} | htcs-Outro
 *       htft-{hda}{hda}
 *       wbh-h | wbh-a
 *       hsf-1 | hsf-2 | hsf-e
 *   2H-required: 2h-home | 2h-draw | 2h-away
 *       2h-{o|u}{N}g   (e.g. 2h-o05g)
 *       h2cs-{H}-{A}
 */
function scoreOutcomeForSel(
  sel: { selection: string },
  ft: FTScore,
  ht?: HTScore
): "won" | "lost" | null {
  // ── Key normalisation (ComprehensiveMarketsSheet keys → canonical keys) ────
  let s = sel.selection;
  if      (s === "1x2-home")   s = "home";
  else if (s === "1x2-draw")   s = "draw";
  else if (s === "1x2-away")   s = "away";
  else if (/^tg-([ou][\d]+)$/.test(s))  s = s.slice(3);   // tg-o25 → o25
  else if (s === "dc-12")      s = "homeOrAway";
  else if (s === "eg-0")       s = "eg-g0";
  else if (s === "eg-1")       s = "eg-g1";
  else if (s === "eg-2")       s = "eg-g2";
  else if (s === "eg-3")       s = "eg-g3";
  else if (s === "eg-4")       s = "eg-g4";
  else if (s === "eg-5p")      s = "eg-g5plus";
  // Period-1 winner (basketball/hockey): use HT-score branch
  else if (s === "p1-home")    s = "ht-home";
  else if (s === "p1-draw")    s = "ht-draw";
  else if (s === "p1-away")    s = "ht-away";

  const { home, away } = ft;
  const total = home + away;

  const htH = ht?.htHome ?? null;
  const htA = ht?.htAway ?? null;
  const h2H = htH !== null ? home - htH : null;
  const h2A = htA !== null ? away - htA : null;

  let winning: boolean | null = null;

  // ── Markets not resolvable from score alone — leave pending for admin ──────
  if (
    s.startsWith("oc") || s.startsWith("uc") ||          // corners
    s.startsWith("cards-") ||                              // cards
    s.startsWith("s1-")  || s.startsWith("s2-") ||        // tennis set winner
    s.startsWith("ts-")  ||                                // tennis total sets
    s.startsWith("hcp-") ||                                // hcap points (no line)
    s === "fg-home" || s === "fg-away" || s === "fg-none"  // first goal
  ) return null;

  // ── Handicap ±1 / ±1.5  (hc-hm1, hc-ap1, hc-hm15, hc-ap15) ─────────────
  if      (s === "hc-hm1"  || s === "hc-hm15") { winning = (home - away) >= 2; }
  else if (s === "hc-ap1"  || s === "hc-ap15") { winning = (home - away) <= 1; }

  // ── 1X2 ───────────────────────────────────────────────────────────────────
  else if (s === "home")            winning = home > away;
  else if (s === "away")       winning = away > home;
  else if (s === "draw")       winning = home === away;

  // ── Double Chance ──────────────────────────────────────────────────────────
  else if (s === "homeOrDraw" || s === "dc-hd") winning = home >= away;
  else if (s === "awayOrDraw" || s === "dc-da") winning = away >= home;
  else if (s === "homeOrAway" || s === "dc-ha") winning = home !== away;

  // ── BTTS ───────────────────────────────────────────────────────────────────
  else if (s === "bts-yes")    winning = home > 0 && away > 0;
  else if (s === "bts-no")     winning = home === 0 || away === 0;

  // ── Total Goals O/U  (o25, u35, o05, etc.) ────────────────────────────────
  else if (/^[ou][\d.]+$/.test(s)) {
    const line = parseFloat(s.slice(1));
    if (!isNaN(line)) winning = s[0] === "o" ? total > line : total < line;
  }

  // ── Goal Odd / Even ────────────────────────────────────────────────────────
  else if (s === "goe-odd")    winning = total % 2 === 1;
  else if (s === "goe-even")   winning = total % 2 === 0;

  // ── Win to Nil ─────────────────────────────────────────────────────────────
  else if (s === "wtn-h")      winning = home > away && away === 0;
  else if (s === "wtn-a")      winning = away > home && home === 0;

  // ── Clean Sheet  (cs-h = home keeps clean sheet; cs-a = away keeps) ────────
  else if (s === "cs-h")       winning = away === 0;
  else if (s === "cs-a")       winning = home === 0;

  // ── Exact Goals ────────────────────────────────────────────────────────────
  else if (s === "eg-g5plus")  winning = total >= 5;
  else if (/^eg-g(\d+)$/.test(s)) {
    winning = total === parseInt(s.slice(4), 10);
  }

  // ── Draw No Bet  (void = null on draw) ────────────────────────────────────
  else if (s === "dnb-home") {
    if (home === away) return null;
    winning = home > away;
  } else if (s === "dnb-away") {
    if (home === away) return null;
    winning = away > home;
  }

  // ── FT Correct Score  (cs-1-0, cs-2-1, cs-Outro) ─────────────────────────
  else if (s.startsWith("cs-")) {
    const body = s.slice(3);
    if (body === "Outro") {
      const common = [
        "0-0","1-0","0-1","1-1","2-0","0-2",
        "2-1","1-2","2-2","3-0","0-3","3-1","1-3","3-2","2-3",
      ];
      winning = !common.includes(`${home}-${away}`);
    } else {
      const parts = body.split("-");
      if (parts.length === 2) {
        const h = parseInt(parts[0]!, 10);
        const a = parseInt(parts[1]!, 10);
        if (!isNaN(h) && !isNaN(a)) winning = home === h && away === a;
      }
    }
  }

  // ── Home Team Goals O/U  (tgh-o05 = home scores > 0.5) ───────────────────
  else if (/^tgh-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^tgh-([ou])(\d+)$/)!;
    const line = parseInt(m[2]!, 10) / 10;
    winning = m[1] === "o" ? home > line : home < line;
  }

  // ── Away Team Goals O/U  (tga-o15 = away scores > 1.5) ───────────────────
  else if (/^tga-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^tga-([ou])(\d+)$/)!;
    const line = parseInt(m[2]!, 10) / 10;
    winning = m[1] === "o" ? away > line : away < line;
  }

  // ══════════ MARKETS THAT REQUIRE HT SCORE ════════════════════════════════
  else if (
    s.startsWith("ht-")   || s.startsWith("htcs-") || s.startsWith("b1h-")  ||
    s.startsWith("wbh-")  || s.startsWith("hsf-")  || s.startsWith("htft-") ||
    s.startsWith("2h-")   || s.startsWith("h2cs-")
  ) {
    // If HT score not yet available, hold settlement until next cycle
    if (htH === null || htA === null) return null;

    // ── HT 1X2 ─────────────────────────────────────────────────────────────
    if      (s === "ht-home")  winning = htH > htA;
    else if (s === "ht-draw")  winning = htH === htA;
    else if (s === "ht-away")  winning = htA > htH;

    // ── BTTS 1st Half ──────────────────────────────────────────────────────
    else if (s === "b1h-yes")  winning = htH > 0 && htA > 0;
    else if (s === "b1h-no")   winning = htH === 0 || htA === 0;

    // ── HT Correct Score ───────────────────────────────────────────────────
    else if (s.startsWith("htcs-")) {
      const body = s.slice(5);
      if (body === "Outro") {
        const common = ["0-0","1-0","0-1","1-1","2-0","0-2","2-1","1-2"];
        winning = !common.includes(`${htH}-${htA}`);
      } else {
        const parts = body.split("-");
        if (parts.length === 2) {
          const h = parseInt(parts[0]!, 10);
          const a = parseInt(parts[1]!, 10);
          if (!isNaN(h) && !isNaN(a)) winning = htH === h && htA === a;
        }
      }
    }

    // ── Win Both Halves ─────────────────────────────────────────────────────
    else if (s === "wbh-h") {
      if (h2H !== null && h2A !== null) winning = htH > htA && h2H > h2A;
    } else if (s === "wbh-a") {
      if (h2H !== null && h2A !== null) winning = htA > htH && h2A > h2H;
    }

    // ── Highest Scoring Half ────────────────────────────────────────────────
    else if (s === "hsf-1" || s === "hsf-2" || s === "hsf-e") {
      if (h2H !== null && h2A !== null) {
        const firstHalfGoals  = htH + htA;
        const secondHalfGoals = h2H + h2A;
        if      (s === "hsf-1") winning = firstHalfGoals  > secondHalfGoals;
        else if (s === "hsf-2") winning = secondHalfGoals > firstHalfGoals;
        else                    winning = firstHalfGoals === secondHalfGoals;
      }
    }

    // ── HT/FT  (htft-hh = HT home / FT home, htft-da = HT draw / FT away) ─
    else if (/^htft-([hda])([hda])$/.test(s)) {
      const m = s.match(/^htft-([hda])([hda])$/)!;
      const htPart = m[1]!;
      const ftPart = m[2]!;
      const htOk =
        htPart === "h" ? htH > htA :
        htPart === "a" ? htA > htH :
        htH === htA;
      const ftOk =
        ftPart === "h" ? home > away :
        ftPart === "a" ? away > home :
        home === away;
      winning = htOk && ftOk;
    }

    // ── 2nd Half Result ─────────────────────────────────────────────────────
    else if (s === "2h-home") {
      if (h2H !== null && h2A !== null) winning = h2H > h2A;
    } else if (s === "2h-draw") {
      if (h2H !== null && h2A !== null) winning = h2H === h2A;
    } else if (s === "2h-away") {
      if (h2H !== null && h2A !== null) winning = h2A > h2H;
    }

    // ── 2nd Half Goals O/U  (2h-o05g, 2h-u15g) ────────────────────────────
    else if (/^2h-([ou])(\d+)g$/.test(s)) {
      if (h2H !== null && h2A !== null) {
        const m = s.match(/^2h-([ou])(\d+)g$/)!;
        const line = parseInt(m[2]!, 10) / 10;
        const total2h = h2H + h2A;
        winning = m[1] === "o" ? total2h > line : total2h < line;
      }
    }

    // ── 2nd Half Correct Score ──────────────────────────────────────────────
    else if (s.startsWith("h2cs-")) {
      if (h2H !== null && h2A !== null) {
        const parts = s.slice(5).split("-");
        if (parts.length === 2) {
          const h = parseInt(parts[0]!, 10);
          const a = parseInt(parts[1]!, 10);
          if (!isNaN(h) && !isNaN(a)) winning = h2H === h && h2A === a;
        }
      }
    }
  }

  return winning === null ? null : winning ? "won" : "lost";
}

/**
 * Find the settled result for a selection.
 * Priority: per-selection matchId → bet-level matchId (singles only).
 */
function findResult(
  sel: SelectionRecord,
  betMatchId: string,
  isSingle: boolean
): { home: number; away: number; htHome?: number; htAway?: number } | null {
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

          const ht: HTScore | undefined =
            typeof result.htHome === "number" && typeof result.htAway === "number"
              ? { htHome: result.htHome, htAway: result.htAway }
              : undefined;

          outcomes.push(scoreOutcomeForSel(sel, result, ht));
        }

        // Only settle when every selection has a resolved outcome (no nulls)
        if (outcomes.some(o => o === null)) continue;

        const allWon = outcomes.every(o => o === "won");
        const newStatus = allWon ? "won" : "lost";

        await db.transaction(async (tx) => {
          // Optimistic lock: only update if still pending
          const rows = await tx
            .update(betsTable)
            .set({ status: newStatus })
            .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
            .returning({ id: betsTable.id });

          if (rows.length === 0) return; // already settled elsewhere

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

  setTimeout(() => { void run(); }, 5000);
  setInterval(() => { void run(); }, 60_000);

  logger.info("Bet auto-settlement worker started (60 s interval)");
}
