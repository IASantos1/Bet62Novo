// Tennis live odds from PulseScore, polled via REST — replaces the earlier
// WebSocket-based approach (tennisWs.ts, removed 2026-08-05). The WS
// connection's URL/auth shape (wss://.../v3/bet365/ws/live?key=...&sport=tennis)
// was never confirmed against real PulseScore data: no "connected" frame or
// live event was ever observed through it, unlike every REST endpoint in
// this integration (football, MMA, leagues), each individually verified
// against a real authenticated response before being trusted. REST is the
// same bookmaker-poll pattern already proven to work everywhere else.
//
// Shares the bet365 bookmaker with football.ts (the only bookmaker
// confirmed to carry tennis, via the real /tennis/leagues sample that
// revealed the DRAW_NO_BET market) rather than a distinct bookmaker prefix
// like basketball/hockey/baseball/volleyball use — picking an unconfirmed
// bookmaker name for tennis would repeat the exact mistake this integration
// keeps having to correct. Since bet365's PRO-plan budget is 1 req/s shared
// with football, this polls at a slightly longer interval than football's
// 1000ms to reduce (not eliminate) collision — an occasional 429 just means
// serving the last good cache for that tick, not a crash (same
// catch-and-fall-back shape as every other PulseScore fetch here).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

const TENNIS_LIVE_TTL_MS = 1_500;

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

let requestsToday = 0;
let usageDate = todayUtc();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollUsageDateIfNeeded(): void {
  const d = todayUtc();
  if (d !== usageDate) {
    usageDate = d;
    requestsToday = 0;
  }
}

export function getPulseScoreTennisUsage(): { requestsToday: number; date: string } {
  rollUsageDateIfNeeded();
  return { requestsToday, date: usageDate };
}

async function fetchTennisLive(): Promise<PulseScoreEvent[]> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  try {
    const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
      "/live-events?sport=tennis&limit=200",
    );
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

/** Live tennis odds from PulseScore (bet365, normalized). Empty array if
 * PULSESCORE_API_KEY isn't configured yet or the upstream call fails. */
export async function getPulseScoreTennisLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  if (cache && now - cache.fetchedAt < TENNIS_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchTennisLive()
      .then((events) => {
        cache = { events, fetchedAt: Date.now() };
        return events;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// ── match_winner → our own odds shape ───────────────────────────────────────
// Verified against a real GET /tennis/leagues call (2026-08-05): PREMATCH
// tennis's match-winner market uses canonicalMarket "DRAW_NO_BET", rawName
// "main". Verified separately against a real GET /live-events?sport=tennis
// call (2026-08-05, 5 live matches): LIVE events use a completely different
// shape for the same market — canonicalMarket "OTHER", rawName "To Win",
// period "FULL_TIME" — which the DRAW_NO_BET/MATCH_RESULT matcher never
// caught, so no real live tennis price was ever read; every live match
// silently fell back to the flat neutral price. Live "To Win" markets carry
// multiple selections per side (older revisions kept as isActive:false
// alongside the current isActive:true one) — the isActive filter already
// used below handles that correctly.
export type PulseScoreTennisOverride = {
  odds?: { home: number; away: number };
  // Real per-set game scores parsed from moreInfo.SS ("7-6,4-6,3-2" — last
  // entry is the set currently in progress), and the current game's point
  // score parsed from moreInfo.XP ("15-30", "40-40", ...). Both verified
  // against the same real live sample referenced above.
  //
  // homeSetsWon/awaySetsWon (only counting sets that pass a real tennis
  // finished-set shape) are what state.homeScore/awayScore get set to in
  // matches.ts, because settlement.ts's generic 1X2 fallthrough
  // (`s === "home" -> winning = home > away`) reads those fields directly
  // for the plain moneyline selection. Leaving them pinned at a permanent
  // 0/0 tie (an earlier, more conservative version of this integration did
  // exactly that) makes that comparison false for BOTH "home" and "away",
  // so scoreOutcomeForSel returns "lost" for every tennis moneyline bet on
  // both sides once the match finishes — worse than never settling.
  sets: Array<[number, number]>;
  homeSetsWon: number;
  awaySetsWon: number;
  currentPoints?: [string, string];
  serving?: [boolean, boolean];
};

const seenUnknownMarkets = new Set<string>();
const seenMatchWinnerPeriods = new Set<string>();

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

function isMatchWinnerMarket(market: PulseScoreMarket): boolean {
  const isFulltime = (market.period || "").toUpperCase() === "FULL_TIME";
  if (!isFulltime) return false;
  if (
    market.canonicalMarket === "DRAW_NO_BET" ||
    market.canonicalMarket === "MATCH_RESULT" ||
    market.canonicalMarket === "match_winner"
  )
    return true;
  // Live in-play shape — see the type comment above for how this was found.
  return (
    market.canonicalMarket === "OTHER" &&
    (market.rawName || "").trim().toLowerCase() === "to win"
  );
}

// moreInfo.SS: comma-separated per-set scores, "home-away" per set, e.g.
// "7-6,4-6,3-2" -> [[7,6],[4,6],[3,2]]. Last entry is the in-progress set.
function parseTennisSetsFromSS(ss: unknown): Array<[number, number]> {
  if (typeof ss !== "string" || !ss.trim()) return [];
  const sets: Array<[number, number]> = [];
  for (const part of ss.split(",")) {
    const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(part);
    if (!m) continue;
    sets.push([Number(m[1]), Number(m[2])]);
  }
  return sets;
}

// A set only counts toward homeSetsWon/awaySetsWon if it's a real, finished
// tennis set score — the in-progress last entry of SS (e.g. "3-2") correctly
// never qualifies. Deliberately conservative/simple (mirrors the spirit of
// settlement.ts's own independent tennisSetFinished check, not imported here
// to keep this file's only dependency direction: matches.ts -> tennis.ts).
function isFinishedTennisSetScore(h: number, a: number): boolean {
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) return false;
  const max = Math.max(h, a);
  const diff = Math.abs(h - a);
  if (max === 7 && (diff === 1 || diff === 2)) return true; // 7-5 / 7-6
  if (max >= 6 && diff >= 2) return true; // 6-0..6-4 (and rare no-ad extensions)
  return false;
}

// moreInfo.XP: current game's point score, "home-away", e.g. "15-30",
// "40-40" (deuce), "AD-40" (advantage — not yet seen in a real sample, but
// bet365's standard notation, handled defensively). Mapped to this
// codebase's existing point-string convention (tennisPointValue in
// matches.ts expects "0"/"15"/"30"/"40" as-is, "D" for deuce, "AD" for ad).
function parseTennisPointsFromXP(xp: unknown): [string, string] | undefined {
  if (typeof xp !== "string") return undefined;
  const parts = xp.split("-").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  const [h, a] = parts as [string, string];
  const hAD = /^ad$/i.test(h);
  const aAD = /^ad$/i.test(a);
  if (hAD || aAD) return [hAD ? "AD" : "40", aAD ? "AD" : "40"];
  if (h === "40" && a === "40") return ["D", "D"];
  return [h, a];
}

// No explicit "serving" field exists anywhere in moreInfo — the only real
// signal found in the live sample is bet365 appending " (Svr)" to the
// serving player's name inside per-game market selections (e.g. "Lizette
// Cabrera (Svr)" in a "Point Betting - Set 2 Game 10" market). Scans every
// market/selection for the first isActive one carrying that suffix. Bounded
// per-event (a live tennis event can carry 60-100+ markets, but this is O(1)
// per event per poll tick, not O(n^2) across events).
function detectTennisServer(
  ev: PulseScoreEvent,
  home: string,
  away: string,
): [boolean, boolean] | undefined {
  for (const m of ev.markets ?? []) {
    for (const sel of m.selections ?? []) {
      if (!sel.isActive) continue;
      const raw = sel.rawName || "";
      if (!/\(Svr\)\s*$/i.test(raw)) continue;
      const name = raw.replace(/\s*\(Svr\)\s*$/i, "").trim();
      if (teamNamesMatch(name, home)) return [true, false];
      if (teamNamesMatch(name, away)) return [false, true];
    }
  }
  return undefined;
}

/** Builds a market override from one PulseScore tennis event's match-winner
 * market plus real live set/point/serving detail. `ev` is the event whose
 * own data is wanted — call this directly on the event you already have,
 * not via a fuzzy name search over the whole live list (that turned
 * football's equivalent function O(n²) — see football.ts's
 * extractFootballOverride comment for the full story). */
export function extractTennisOverride(ev: PulseScoreEvent): PulseScoreTennisOverride {
  const matchWinnerMarkets = (ev.markets ?? []).filter(isMatchWinnerMarket);
  for (const m of ev.markets ?? []) {
    if (matchWinnerMarkets.includes(m)) continue;
    if (!seenUnknownMarkets.has(m.canonicalMarket)) {
      seenUnknownMarkets.add(m.canonicalMarket);
      logger.info(
        { canonicalMarket: m.canonicalMarket, rawName: m.rawName },
        "[pulsescore] unmapped tennis canonicalMarket seen — candidate to add to the override mapping",
      );
    }
  }

  const sets = parseTennisSetsFromSS(ev.moreInfo?.["SS"]);
  const homeSetsWon = sets.filter(
    ([h, a]) => isFinishedTennisSetScore(h, a) && h > a,
  ).length;
  const awaySetsWon = sets.filter(
    ([h, a]) => isFinishedTennisSetScore(h, a) && a > h,
  ).length;
  const currentPoints = parseTennisPointsFromXP(ev.moreInfo?.["XP"]);
  const serving = detectTennisServer(ev, ev.home, ev.away);

  // If more than one match_winner-shaped market shows up (e.g. per-set odds
  // alongside the overall match), skip odds rather than risk mixing them up
  // — same conservative approach as the old WS implementation. Set/point
  // data above is independent of this and still returned.
  if (matchWinnerMarkets.length !== 1) {
    for (const m of matchWinnerMarkets) {
      const key = m.period || "(no period)";
      if (!seenMatchWinnerPeriods.has(key)) {
        seenMatchWinnerPeriods.add(key);
        logger.info(
          { period: m.period, count: matchWinnerMarkets.length },
          "[pulsescore] tennis match_winner period seen — multiple candidates, needs disambiguation",
        );
      }
    }
    return { sets, homeSetsWon, awaySetsWon, currentPoints, serving };
  }
  const market = matchWinnerMarkets[0]!;
  let home: number | null = null;
  let away: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") home = val;
    else if (sel.canonicalOutcome === "AWAY") away = val;
    else if (teamNamesMatch(sel.rawName, ev.home)) home = val;
    else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
  }
  return {
    ...(home !== null && away !== null ? { odds: { home, away } } : {}),
    sets,
    homeSetsWon,
    awaySetsWon,
    currentPoints,
    serving,
  };
}

/** Finds the PulseScore tennis event matching a tracked match by player name
 * (tolerant cross-provider match) and returns its market override, if any.
 * `events` should be one already-fetched getPulseScoreTennisLive() batch —
 * never call this per-match, it would blow the shared bet365 rate limit. */
export function findPulseScoreTennisOverride(
  home: string,
  away: string,
  events: PulseScoreEvent[],
): PulseScoreTennisOverride | null {
  const ev = events.find(
    (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const override = extractTennisOverride(ev);
  return override.odds ? override : null;
}
