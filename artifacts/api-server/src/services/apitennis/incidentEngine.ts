// Tennis incident engine — added 2026-09-19 as Fase 5 of the tennis
// architecture rework. Derives suspension-worthy incidents purely from
// poll-to-poll deltas of api-tennis's own already-confirmed-real fields
// (event_game_result, event_serve, scores) — NEVER from `pointbypoint`,
// which the provider's own docs and this codebase's own comment both flag
// as usually empty by the time REST is polled (confirmed dormant via a
// full-repo grep: written to _liveExtra.pointByPoint but never read
// anywhere). If a future check confirms pointbypoint's break_point/
// set_point/match_point flags really do populate in practice, those should
// become the preferred source and this arithmetic the fallback — not the
// other way around.
//
// This only classifies incidents for SUSPENSION/DISPLAY. Settlement never
// reads from here — it stays entirely final-score-based (settlement.ts's
// getTennisSetsFromExtras/tennisSetFinished), which is correct and does not
// change.

export type TennisIncidentType =
  | "POINT"
  | "GAME"
  | "BREAK_POINT"
  | "SET_POINT"
  | "MATCH_POINT"
  | "SET_WON"
  | "SERVER_CHANGE"
  | "MATCH_FINISHED";

export type TennisIncidentState = {
  sets: Array<[number, number]>;
  currentPoints?: [number | string, number | string];
  serving?: [boolean, boolean];
};

/** Raw game-point value straight from api-tennis (0/15/30/40 as numbers
 * once parseApiTennisGameResult runs Number() on them, "AD" as a string) —
 * NOT a 0-4 bucket like the abandoned computeTennisExtras-era
 * tennisPointValue() this deliberately doesn't reuse. AD is mapped past 40
 * so "value >= 40 && diff >= 1" reads the same whether the leader is
 * exactly at 40 or holds advantage. */
function rawPointValue(p: number | string | undefined): number {
  if (typeof p === "number") return p;
  if (typeof p === "string" && p.trim().toUpperCase() === "AD") return 45;
  return 0;
}

/** True once the set has reached 6-6 games — the only point in a standard
 * set where api-tennis's game-result scale switches from 0/15/30/40/AD to a
 * plain point race (tiebreak). Games beyond 6-6 in a no-tiebreak deciding
 * set (rare, some tournaments still play advantage final sets) are treated
 * as a continuation of the regular scale, which is what api-tennis itself
 * reports in that case (still 0/15/30/40/AD, not a point race). */
function isTiebreakGame(setGames: [number, number] | undefined): boolean {
  return !!setGames && setGames[0] === 6 && setGames[1] === 6;
}

/** Does `value` represent a game point for its holder given the opponent's
 * value, in the current game's scale (regular deuce-scoring or tiebreak
 * race)? Regular: game point once at 40+ with at least a 1-point lead
 * (excludes 40-40 deuce, includes 40-<40 and AD). Tiebreak: mirrors the
 * same "leading by >=1 at/above the target" shape at the 6-point mark
 * (first to 7, win by 2). */
function hasGamePoint(value: number, opponentValue: number, tiebreak: boolean): boolean {
  const threshold = tiebreak ? 6 : 40;
  return value >= threshold && value - opponentValue >= 1;
}

/** Would winning the current game finish the set for its holder, given
 * that player's games already won in this set? Standard "first to 6, win
 * by 2, else tiebreak at 6-6" rule; the tiebreak game itself always decides
 * the set once reached. */
function wouldWinSet(myGames: number, opponentGames: number, tiebreak: boolean): boolean {
  if (tiebreak) return true;
  const gamesAfter = myGames + 1;
  return gamesAfter >= 6 && gamesAfter - opponentGames >= 2;
}

export type TennisIncident = {
  type: TennisIncidentType;
  /** Which side the incident favors/concerns — undefined for
   * match-wide incidents (SET_WON's winner is always attributed). */
  side?: "home" | "away";
};

/** Compares the previous and current tick's real facts and returns every
 * incident that occurred since the last poll. Never depends on
 * `pointbypoint`. `setsToWinMatch` defaults to 2 (best-of-3, the
 * overwhelming majority of matches on this platform) — MATCH_POINT is
 * therefore a slight under-detection for best-of-5 matches (flagged at 2
 * sets instead of 3), a display-only limitation with no settlement impact
 * since settlement never reads this engine. */
export function detectTennisIncidents(
  previous: TennisIncidentState | undefined,
  current: TennisIncidentState,
  setsToWinMatch = 2,
): TennisIncident[] {
  const incidents: TennisIncident[] = [];

  const prevServing = previous?.serving;
  if (current.serving && prevServing && (current.serving[0] !== prevServing[0] || current.serving[1] !== prevServing[1])) {
    incidents.push({ type: "SERVER_CHANGE" });
  }

  const prevSets = previous?.sets ?? [];
  const curSets = current.sets;
  if (curSets.length > prevSets.length && prevSets.length > 0) {
    const finished = prevSets[prevSets.length - 1];
    if (finished) {
      incidents.push({ type: "SET_WON", side: finished[0] > finished[1] ? "home" : "away" });
    }
  }

  const prevCurrentSet = prevSets[prevSets.length - 1];
  const curCurrentSet = curSets[curSets.length - 1];
  if (
    curCurrentSet &&
    prevCurrentSet &&
    curSets.length === prevSets.length &&
    (curCurrentSet[0] !== prevCurrentSet[0] || curCurrentSet[1] !== prevCurrentSet[1])
  ) {
    incidents.push({ type: "GAME", side: curCurrentSet[0] > prevCurrentSet[0] ? "home" : "away" });
  }

  if (current.currentPoints && previous?.currentPoints) {
    const [ph, pa] = previous.currentPoints;
    const [ch, ca] = current.currentPoints;
    if (ph !== ch || pa !== ca) incidents.push({ type: "POINT" });
  }

  if (current.currentPoints && curCurrentSet) {
    const tiebreak = isTiebreakGame(curCurrentSet);
    const homeVal = rawPointValue(current.currentPoints[0]);
    const awayVal = rawPointValue(current.currentPoints[1]);
    const homeGamePoint = hasGamePoint(homeVal, awayVal, tiebreak);
    const awayGamePoint = hasGamePoint(awayVal, homeVal, tiebreak);

    if (homeGamePoint || awayGamePoint) {
      const side: "home" | "away" = homeGamePoint ? "home" : "away";
      const myGames = side === "home" ? curCurrentSet[0] : curCurrentSet[1];
      const oppGames = side === "home" ? curCurrentSet[1] : curCurrentSet[0];
      // Exclude the trailing entry — it's the set currently in progress
      // (buildApiTennisSets's own convention), so counting it via a bare
      // h>a/a>h comparison would wrongly credit a set that's merely ahead
      // (e.g. leading 5-4) as already won.
      const completedSets = curSets.slice(0, -1);
      const homeSetsWon = completedSets.filter(([h, a]) => h > a).length;
      const awaySetsWon = completedSets.filter(([h, a]) => a > h).length;
      const mySets = side === "home" ? homeSetsWon : awaySetsWon;

      if (wouldWinSet(myGames, oppGames, tiebreak)) {
        if (mySets + 1 >= setsToWinMatch) {
          incidents.push({ type: "MATCH_POINT", side });
        } else {
          incidents.push({ type: "SET_POINT", side });
        }
      } else if (current.serving && current.serving[side === "home" ? 1 : 0]) {
        // Receiver (not currently serving) holds game point in a regular
        // game that wouldn't itself finish the set — a break point.
        incidents.push({ type: "BREAK_POINT", side });
      }
    }
  }

  return incidents;
}
