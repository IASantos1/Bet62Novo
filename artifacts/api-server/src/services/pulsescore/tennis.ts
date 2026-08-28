// Tennis live odds from PulseScore — REST-polled here, with a per-event WS
// freshness overlay (getPulseScoreTennisLive below) since the 2026-08-11
// MAX plan upgrade (3 concurrent connections — see tennisWs.ts's header).
//
// WS was tried twice before that: first attempt (2026-08-05) never
// produced a single confirmed frame (git history commit ede487a); second
// attempt (2026-08-07) worked, but the PRO plan only allowed one
// concurrent WS connection, and it was moved to football on 2026-08-08
// (explicit user decision — football's live clock/score is what was
// actually causing complaints, particularly for lower-coverage matches
// where REST polling alone couldn't keep up; see footballWs.ts's header).
// Tennis stayed REST-only from then until the MAX plan removed the
// one-connection constraint.
//
// Briefly switched to bwin (2026-08-09, same explicit user decision that
// moved football/basketball off bet365 — see football.ts's FOOTBALL_BOOKMAKER
// comment) and reverted back to bet365 the same day after real bwin samples
// (prematch /tennis/leagues + /tennis/events, live /live-events?sport=tennis,
// and a single live event re-checked directly by eventId) confirmed there is
// NO live point score anywhere in bwin's tennis feed: no `score` field, no
// moreInfo at all (unlike bet365's moreInfo.SS for set scores and moreInfo.XP
// for the current game's point score), and no serving indicator. The closest
// thing bwin has is a "Game N Winner, Set M" market whose rawName reveals
// which game number is current — real, but nowhere near enough to reconstruct
// 15/30/40/AD or the exact games-per-set split. Since matches.ts's
// finalizeStaleLiveMatch persists state.homeScore/awayScore (== sets won,
// which never advances without real set-score data) as the FINAL result the
// moment a live match disappears, staying on bwin would have made every live
// tennis moneyline bet settle 0-0 (both sides "lost") — confirmed but never
// shipped past this same-day revert. TENNIS_BOOKMAKER is kept as an explicit
// constant (rather than silently relying on CONFIG.PULSESCORE_BOOKMAKER's
// default) specifically so reverting is a one-line change, not a
// rediscovery. The market-shape fixes made during the brief bwin period
// (line on the market not the selection, bwin's Set Winner shape,
// teamNamesMatch's initial+surname fallback) are kept as additive/dual
// support — see their own comments — since they don't regress bet365.
//
// Moved to onexbet (1xBet) 2026-08-27 alongside every non-football sport.
// Unlike bwin, onexbet DOES carry real live set/point data for tennis —
// CONFIRMED against a real GET /live-events?sport=tennis sample the same
// day: a `statistics.sets` block with per-set game counts (last entry is
// the in-progress set, same semantic as bet365's moreInfo.SS),
// `moreInfo.gamePoints` for the current game's point score ("H:A" with a
// colon, not bet365's XP hyphen format — see parseTennisPointsFromGamePoints),
// and `ev.score` as a SETS WON summary (not a live game count — an initial,
// pre-real-data guess in this file wrongly treated it as one and appended it
// as a fake extra set; corrected once the real sample arrived). This isn't
// the bwin dead-end: parseTennisSets/parseTennisPoints below add this
// confirmed onexbet path ADDITIVELY alongside the existing moreInfo.SS/XP
// path — bet365 keeps working unchanged if TENNIS_BOOKMAKER ever reverts.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  pulseScoreGetWithRetry,
  type PulseScoreEvent,
  type PulseScoreMarket,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";
import { getTennisWsEventIfFresh } from "./tennisWs.js";

const TENNIS_BOOKMAKER = "onexbet";

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
  // Lets errors propagate — see getPulseScoreTennisLiveRest's .catch() for
  // why silently swallowing them here (the previous behavior) was a real
  // bug: a 429 from the shared bet365 budget (collides with football's own
  // 1000ms poll) silently wiped tennis's REST-fallback data to empty with
  // no trace anywhere.
  const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
    "/live-events?sport=tennis&limit=200",
    4000,
    TENNIS_BOOKMAKER,
  );
  return Array.isArray(data?.events) ? data.events : [];
}

/** Live tennis odds from PulseScore (bet365, normalized), REST-polled, with
 * a per-event WS freshness overlay (mergeTennisWsFreshness below).
 * Empty array if PULSESCORE_API_KEY isn't configured yet, or the upstream
 * call fails on the very first attempt (nothing cached yet to fall back
 * to). */
export async function getPulseScoreTennisLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  let events: PulseScoreEvent[];
  if (cache && now - cache.fetchedAt < TENNIS_LIVE_TTL_MS) {
    events = cache.events;
  } else if (!inFlight) {
    inFlight = fetchTennisLive()
      .then((fetched) => {
        cache = { events: fetched, fetchedAt: Date.now() };
        return fetched;
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] tennis REST-fallback live fetch failed — serving stale cache",
        );
        return cache?.events ?? [];
      })
      .finally(() => {
        inFlight = null;
      });
    events = await inFlight;
  } else {
    events = await inFlight;
  }
  // Defense in depth: an unexpected failure in the WS overlay must never
  // take the whole REST live list down with it (this whole feed going
  // empty is a much worse outcome than one tick without the overlay).
  try {
    return mergeTennisWsFreshness(events);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[pulsescore] tennis WS overlay failed — serving REST events unmerged",
    );
    return events;
  }
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
  //
  // This exact scenario is exactly why the brief 2026-08-09 bwin switch was
  // reverted the same day: bwin's total absence of moreInfo (confirmed
  // against real prematch and live samples, including a live event re-
  // checked directly by eventId) reproduces the permanent-0/0 case described
  // above for every match — see this file's header comment for the full
  // story.
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
// bet365-only — confirmed absent for bwin (see this file's header).
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

// onexbet — CONFIRMED against a real GET /live-events?sport=tennis sample
// (2026-08-27): statistics.sets.home/away are parallel arrays of GAMES per
// set, one entry per set INCLUDING the current in-progress set as the last
// entry — same "last entry is in progress" semantic as bet365's moreInfo.SS,
// e.g. a real 2nd-set-in-progress event carried sets home=[6,3] away=[2,4]
// (set 1 finished 6-2 home, set 2 in progress 3-4). ev.score is NOT part of
// this array — it's SETS WON (a summary count), confirmed by cross-checking
// that same event: ev.score was {home:"1", away:"0"}, which matches
// homeSetsWon=1 once isFinishedTennisSetScore below filters the in-progress
// second set out of statistics.sets. An earlier version of this function
// wrongly appended ev.score as a fake extra "set" on top of statistics.sets
// (a guess made before this real sample existed) — corrected now that real
// data disproved it; don't reintroduce that append.
function parseTennisSetsFromStatistics(ev: PulseScoreEvent): Array<[number, number]> {
  const stats = (ev as PulseScoreEvent & {
    statistics?: { sets?: { home?: number[]; away?: number[] } };
  }).statistics;
  const home = stats?.sets?.home;
  const away = stats?.sets?.away;
  if (!Array.isArray(home) || !Array.isArray(away)) return [];
  const len = Math.min(home.length, away.length);
  const sets: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) {
    const h = home[i];
    const a = away[i];
    if (typeof h === "number" && typeof a === "number") sets.push([h, a]);
  }
  return sets;
}

// SS first (bet365, confirmed real), falling back to the statistics shape
// (onexbet, also confirmed real) only when SS is absent — never mixes the
// two, and produces [] rather than a wrong guess when neither bookmaker's
// fields are actually populated (e.g. bwin, which has neither).
function parseTennisSets(ev: PulseScoreEvent): Array<[number, number]> {
  const ssSets = parseTennisSetsFromSS(ev.moreInfo?.["SS"]);
  if (ssSets.length > 0) return ssSets;
  return parseTennisSetsFromStatistics(ev);
}

// ── WS freshness overlay (2026-08-11 MAX plan reactivation) ────────────────
// Same "advance-only, per-event" design as football.ts/basketball.ts's WS
// merges, but applied to moreInfo.SS/XP instead of score/matchClock —
// that's where tennis's real live state actually lives (see this file's
// header and PulseScoreTennisOverride's comment on ev.score being
// unpopulated for tennis). Odds (ev.markets) always stay from REST,
// unchanged — only the live set/game/point data can come from WS.
//
// onexbet-only caveat: this merge only ever swaps `moreInfo`, so it still
// speeds up bet365's moreInfo.SS/XP path but does NOT carry onexbet's
// statistics/score fields from WS to REST — parseTennisSetsFromStatistics
// above is REST-poll-only for now (TENNIS_LIVE_TTL_MS cadence, no WS boost).
// Extending this merge to also compare/carry `statistics` is real future
// work, deliberately not done blind alongside the parsing itself above.
const TENNIS_WS_EVENT_FRESHNESS_MS = 4_000;

// A monotonic-ish progress score from moreInfo.SS: completed/in-progress
// sets weighted far above games within a set, so a new set always ranks
// higher than any number of extra games in the same set — mirrors
// basketball.ts's PERIOD_RANK approach (weight the coarser unit heavily,
// use the finer one only to break ties within it).
function tennisSetsProgress(ss: unknown): number {
  const sets = parseTennisSetsFromSS(ss);
  const games = sets.reduce((sum, [h, a]) => sum + h + a, 0);
  return sets.length * 1000 + games;
}

function isWsMoreInfoAtLeastAsAdvanced(
  wsMoreInfo: PulseScoreEvent["moreInfo"],
  restMoreInfo: PulseScoreEvent["moreInfo"],
): boolean {
  if (!wsMoreInfo) return false;
  if (!restMoreInfo) return true;
  return (
    tennisSetsProgress(wsMoreInfo["SS"]) >= tennisSetsProgress(restMoreInfo["SS"])
  );
}

/** Exported only for tests — mirrors basketball.ts's mergeBasketballWsFreshness. */
export function mergeTennisWsFreshness(restEvents: PulseScoreEvent[]): PulseScoreEvent[] {
  return restEvents.map((ev) => {
    if (!ev.eventId) return ev;
    const wsEv = getTennisWsEventIfFresh(ev.eventId, TENNIS_WS_EVENT_FRESHNESS_MS);
    if (!wsEv) return ev;
    return {
      ...ev,
      moreInfo: isWsMoreInfoAtLeastAsAdvanced(wsEv.moreInfo, ev.moreInfo)
        ? wsEv.moreInfo
        : ev.moreInfo,
    };
  });
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

// onexbet — CONFIRMED against a real GET /live-events?sport=tennis sample
// (2026-08-27): moreInfo.gamePoints is a "H:A" string with a COLON
// separator (e.g. "40:40", "15:40", "0:0"), NOT bet365's XP hyphen format
// ("15-30") — reusing the XP parser as-is (an earlier, pre-real-data version
// of this function did exactly that) silently fails to split it. Advantage
// is denoted "A" here (seen: "40:A"), not bet365's "AD" — handled alongside
// "AD"/"ad" defensively. Deep-into-a-tiebreak samples showed values past 40
// (seen: "11:12", "2:8" during a 3rd-set breaker) — passed through as-is,
// same "unrecognized shape, don't guess" behavior the XP parser already has;
// whether matches.ts's tennisPointValue displays those usefully is a
// separate, not-yet-checked concern.
function parseTennisPointsFromGamePoints(raw: unknown): [string, string] | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  const [h, a] = parts as [string, string];
  const hAD = /^a(d)?$/i.test(h);
  const aAD = /^a(d)?$/i.test(a);
  if (hAD || aAD) return [hAD ? "AD" : "40", aAD ? "AD" : "40"];
  if (h === "40" && a === "40") return ["D", "D"];
  return [h, a];
}

function parseTennisPoints(ev: PulseScoreEvent): [string, string] | undefined {
  return (
    parseTennisPointsFromXP(ev.moreInfo?.["XP"]) ??
    parseTennisPointsFromGamePoints(ev.moreInfo?.["gamePoints"])
  );
}

// No explicit "serving" field exists anywhere in moreInfo — the only real
// signal found in the bet365 live sample was bet365 appending " (Svr)" to
// the serving player's name inside per-game market selections (e.g.
// "Lizette Cabrera (Svr)" in a "Point Betting - Set 2 Game 10" market).
// Scans every market/selection for the first isActive one carrying that
// suffix. Bounded per-event (a live tennis event can carry 60-100+ markets,
// but this is O(1) per event per poll tick, not O(n^2) across events).
// bwin's real live sample (2026-08-09) shows no "(Svr)" suffix anywhere (no
// moreInfo at all, same as everywhere else in that feed) — this now always
// returns undefined for bwin, which is safe (serving stays unset, same as
// any other match with no server signal) rather than wrong.
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

  const sets = parseTennisSets(ev);
  const homeSetsWon = sets.filter(
    ([h, a]) => isFinishedTennisSetScore(h, a) && h > a,
  ).length;
  const awaySetsWon = sets.filter(
    ([h, a]) => isFinishedTennisSetScore(h, a) && a > h,
  ).length;
  const currentPoints = parseTennisPoints(ev);
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

// ── Prematch ─────────────────────────────────────────────────────────────
// Verified against two real authenticated calls (2026-08-07):
//   GET /api/v3/bet365/tennis/leagues — paginated, grouped by league, but
//     every event sampled carried exactly ONE market (DRAW_NO_BET/"main",
//     the moneyline) — a lean projection, not the full market list.
//   GET /api/v3/bet365/tennis/events — paginated, flat (no league grouping),
//     same per-event shape (eventId/home/away/league/live/startTime/
//     moreInfo/markets), but each event carried 10-20+ real markets:
//     MATCH_RESULT/"To Win Match" (moneyline — same canonicalMarket
//     "MATCH_RESULT" isMatchWinnerMarket above already matches, rawName
//     differs from /leagues' "main" but canonicalMarket alone is enough),
//     SET_WINNER/"1st Set Winner" (period FIRST_SET, canonicalOutcome
//     HOME/AWAY), TOTAL_GAMES/"Total Games 2-Way" and "1st Set Total Games"
//     (canonicalOutcome OVER/UNDER, line per selection, sometimes several
//     lines per market), SET_BETTING (one market PER PLAYER, name in
//     moreInfo.subMarket, each listing that player's own "2-0"/"2-1"
//     winning-score odds), GAME_HANDICAP/"Match Handicap (Games)" (two
//     selections, canonicalOutcome "OTHER" on both — no explicit HOME/AWAY
//     attribution field, unlike every other 2-way market here — skipped
//     below rather than guessed, see extractTennisPrematchExtra). Uses
//     /events (not /leagues) for the richer markets — no league-catalog
//     filtering happens for tennis either way (see buildTennisLiveFromPulseScore
//     in matches.ts), so the flat shape costs nothing here.
//
// Also checked against real bwin /tennis/leagues, /tennis/events and
// /live-events?sport=tennis samples during the brief 2026-08-09 bwin period
// (see this file's header comment for why it was reverted the same day):
// moneyline still canonicalMarket "MATCH_RESULT"/period FULL_TIME
// (isMatchWinnerMarket above already matches, no change needed). Set Winner
// reuses canonicalMarket "MATCH_RESULT" too — period FIRST_SET/SECOND_SET/
// THIRD_SET is the only thing distinguishing it from the overall match
// winner, not a dedicated "SET_WINNER" canonicalMarket — and its selections
// carry canonicalOutcome "OTHER" with the player name in rawName, not
// HOME/AWAY (see extractTennisPrematchExtra's setWinner block, which matches
// both bookmakers' shapes). TOTAL_GAMES puts `line` on the market, never the
// selection (see collectOverUnderLines, also fixed to handle both). SET_
// BETTING is a single combined market with no per-player split and no
// moreInfo at all (see the exactSets comment below). GAME_HANDICAP/
// SET_HANDICAP, unlike bet365, DO carry explicit HOME/AWAY — not extracted
// here regardless, out of scope. Zero moreInfo confirmed anywhere in any of
// these three endpoints' samples, including a live event re-checked directly
// by eventId — the concrete reason for the revert (see header).
export type PulseScoreTennisPrematchEvent = PulseScoreEvent & {
  startTime: string;
  live: boolean;
};

type PulseScoreTennisEventsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  events: PulseScoreTennisPrematchEvent[];
};

// Prematch doesn't need second-level freshness like the live poller — a
// multi-minute cache keeps this well clear of bet365's shared 1 req/s budget.
const TENNIS_UPCOMING_TTL_MS = 5 * 60_000;
let upcomingCache: { events: PulseScoreTennisPrematchEvent[]; fetchedAt: number } | null = null;
let upcomingInFlight: Promise<PulseScoreTennisPrematchEvent[]> | null = null;

async function fetchAllTennisEvents(): Promise<PulseScoreTennisPrematchEvent[]> {
  const events: PulseScoreTennisPrematchEvent[] = [];
  let page = 1;
  // Real sample: total 274 events at limit=30 (the documented max) -> ~10
  // pages, paced 4s apart — see football.ts's fetchAllFootballLeagues for
  // the full contention story that pace was chosen to avoid (this fetch
  // only runs once per TENNIS_UPCOMING_TTL_MS in the background, nothing
  // user-facing waits on it).
  for (let i = 0; i < 15; i++) {
    const data = await pulseScoreGetWithRetry<PulseScoreTennisEventsResponse>(
      `/tennis/events?page=${page}&limit=30`,
      { bookmaker: TENNIS_BOOKMAKER },
    );
    if (!data) break; // out of retries — keep whatever was already collected
    if (Array.isArray(data.events)) events.push(...data.events);
    if (!data.hasNextPage) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return events;
}

async function fetchTennisUpcoming(): Promise<PulseScoreTennisPrematchEvent[]> {
  const events = await fetchAllTennisEvents();
  // Docs say this endpoint already only returns non-live events; filter
  // defensively anyway rather than trust that unconditionally.
  return events.filter((ev) => !ev.live);
}

/** Upcoming tennis fixtures from PulseScore (bet365), each carrying its
 * MATCH_RESULT prematch odds when bet365 has priced it yet. Empty array if
 * PULSESCORE_API_KEY isn't configured, or the upstream call fails on the
 * very first attempt (nothing cached yet to fall back to). */
export async function getPulseScoreTennisUpcoming(): Promise<PulseScoreTennisPrematchEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (upcomingCache && now - upcomingCache.fetchedAt < TENNIS_UPCOMING_TTL_MS)
    return upcomingCache.events;
  if (!upcomingInFlight) {
    upcomingInFlight = fetchTennisUpcoming()
      .then((events) => {
        upcomingCache = { events, fetchedAt: Date.now() };
        return events;
      })
      .catch((err) => {
        // Used to swallow the error and overwrite upcomingCache with []
        // unconditionally — a single transient failure across the ~10-page
        // paginated /tennis/events fetch (429 collision with the live
        // pollers' shared bet365 budget, a timeout, ...) wiped 5 minutes of
        // prematch listings to empty, which is exactly what shows up on the
        // site as matches "appearing and disappearing". Log it and keep
        // serving whatever was cached instead.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[pulsescore] tennis upcoming fetch failed — serving stale cache",
        );
        return upcomingCache?.events ?? [];
      })
      .finally(() => {
        upcomingInFlight = null;
      });
  }
  return upcomingInFlight;
}

export type PulseScoreTennisPrematchExtra = {
  firstSet?: { home: number; away: number };
  totalGames?: { line: number; over: number; under: number };
  totalGamesLines?: Array<{ line: number; over: number; under: number }>;
  set1Games?: { line: number; over: number; under: number };
  exactSets?: { h20: number; h21: number; a02: number; a12: number };
  // Total games odd/even — canonicalMarket TOTAL_GOALS_ODD_EVEN, confirmed
  // real (2026-08-27, onexbet /tennis/leagues sample). Settlement.ts already
  // has a dedicated oe-odd/oe-even key for this (settlement.ts ~2713) that
  // correctly uses tennis's own games-derived total, NOT the generic
  // goe-odd/goe-even key (which reads ft.home+ft.away — SETS won for
  // tennis, not games; using it here would silently grade the wrong stat).
  // Matches AdvancedMarkets.tennisExtra's existing oddEvenGames field.
  oddEvenGames?: { odd: number; even: number };
  // GAME_HANDICAP — confirmed real (2026-08-28, onexbet /tennis/leagues
  // catalog: canonicalMarket 'GAME_HANDICAP', periods FIRST_SET/FULL_TIME/
  // SECOND_SET, outcomes HOME/AWAY, rawNames "Handicap"/"1st set Handicap"/
  // "2nd set Handicap"). Same signed-line shape already proven for
  // basketball's spread and hockey's puck line this session — matches.ts's
  // tennisExtra.gameHandicap field already exists (synthetic-only so far).
  gameHandicap?: { line: number; home: number; away: number };
  // HOME_OVER_UNDER/AWAY_OVER_UNDER — confirmed real (same catalog,
  // rawNames "Total 1"/"Total 2" — per-player game totals). Matches
  // tennisExtra's existing homePlayerGames/awayPlayerGames fields.
  homePlayerGames?: { line: number; over: number; under: number };
  awayPlayerGames?: { line: number; over: number; under: number };
  // The rest below are all confirmed real (2026-08-28), all canonicalMarket
  // "OTHER" (PulseScore has no dedicated type for them) with the actual
  // market identified by rawName instead — settleable using only the set
  // scores already tracked (getTennisSetsFromExtras in settlement.ts), no
  // new stat feed needed. rawName "Sets Handicap": same two-selections-
  // per-side, multi-line, real-signed-line shape as GAME_HANDICAP (rawName
  // "1 (-1.5)"/"1 (1.5)" for home, "2 (...)" for away — "1"/"2" here are
  // 1xBet's own player-slot numbering, not literal text to match against
  // team names). Previously wired in matches.ts/home.tsx as a HARDCODED
  // "home -1.5 sets" assumption regardless of who was actually favored —
  // real signed line fixes that the same way gameHandicap was fixed.
  setHandicap?: { line: number; home: number; away: number };
  // rawName "Tie-Break" (FULL_TIME) / "1st set Tie-Break" (FIRST_SET) —
  // plain Yes/No, canonicalOutcome "OTHER" with rawName "Yes"/"No".
  tieBreak?: { yes: number; no: number };
  tieBreak1st?: { yes: number; no: number };
  // rawName "Total Tie-Breaks" — Over/Under how many sets went to a
  // tie-break, multi-line like totalGames (collectOverUnderLines below
  // reads market.canonicalMarket-agnostic, so it's reused here too).
  totalTieBreaks?: { line: number; over: number; under: number };
  // rawName "Total Sets" — Over/Under 2.5 (best-of-3 went 2 or 3 sets).
  totalSets?: { line: number; over: number; under: number };
  // rawName "Highest Scoring Set Total" — TWO sub-markets share this one
  // rawName in the real sample: an Over/Under total-games line (the
  // single highest-scoring set's total games) AND a 3-way "1st Set >/</=
  // 2nd" comparison (rawNames literally "1st Set > 2nd" etc, no line).
  // "Sets Scoring" is the exact same 3-way comparison under a different
  // rawName in some samples — both map to the same field.
  highestSetTotal?: { line: number; over: number; under: number };
  setsScoring?: { firstHigher: number; secondHigher: number; equal: number };
  // rawName "Set / Match" — combined "who won set 1 / who won the match"
  // (rawNames "W1/W1"/"W1/W2"/"W2/W1"/"W2/W2", W1=home won, W2=away won).
  setMatch?: { h11: number; h12: number; a21: number; a22: number };
};

function collectOverUnderLines(
  markets: PulseScoreMarket[],
): Array<{ line: number; over: number; under: number }> {
  const byLine = new Map<number, { over: number | null; under: number | null }>();
  for (const m of markets) {
    for (const sel of m.selections ?? []) {
      if (!sel.isActive) continue;
      // bwin puts `line` on the market, never the selection (same shape
      // confirmed for football/basketball's TOTAL_GOALS/TOTAL_POINTS) —
      // sel.line stays the primary source since a single market can list
      // several lines with each selection tagging its own (seen for
      // TOTAL_GAMES: Set 1 in the real bwin sample, three separate markets
      // for 8/8.5/10.5/12.5), market.line only applies when the market
      // carries just one line and doesn't say so per-selection.
      const line = sel.line ?? m.line;
      if (line === undefined) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const entry = byLine.get(line) ?? { over: null, under: null };
      if (sel.canonicalOutcome === "OVER") entry.over = val;
      else if (sel.canonicalOutcome === "UNDER") entry.under = val;
      byLine.set(line, entry);
    }
  }
  const out: Array<{ line: number; over: number; under: number }> = [];
  for (const [line, { over, under }] of byLine) {
    if (over !== null && under !== null) out.push({ line, over, under });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** GAME_HANDICAP extraction — same shape/convention already proven for
 * basketball's spread and hockey's puck line (extractSpread in
 * basketball.ts): HOME carries the signed line (home's own selection),
 * AWAY is the mirror side at the same market. */
// GAME_HANDICAP carries MULTIPLE alternate lines per market (confirmed real,
// both prematch and live samples, 2026-08-28 — e.g. a real live sample had
// HOME priced at +3.5/+4/+4.5/+5/+5.5 games, AWAY mirrored at the exact
// negated line each). HOME's own `sel.line` is genuinely signed (positive
// when HOME is the underdog getting a games head start, negative when HOME
// is favored) — confirmed against real moneyline data on every sample
// (the HOME side with positive handicap lines always had the longer
// moneyline odds). Pairs HOME/AWAY selections by matching |line| (same
// pairing bwin/onexbet already uses elsewhere — a canonical two-way Asian
// handicap always mirrors the magnitude) and picks the most-even-odds pair,
// same idea as pickMostEvenLine for totals.
function extractGameHandicap(
  market: PulseScoreMarket,
): { line: number; home: number; away: number } | null {
  const homeByAbsLine = new Map<number, { line: number; odds: number }>();
  const awayByAbsLine = new Map<number, number>();
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const line = sel.line ?? market.line;
    if (line === undefined) continue;
    const absLine = Math.abs(line);
    if (sel.canonicalOutcome === "HOME") homeByAbsLine.set(absLine, { line, odds: val });
    else if (sel.canonicalOutcome === "AWAY") awayByAbsLine.set(absLine, val);
  }
  const pairs: Array<{ line: number; home: number; away: number }> = [];
  for (const [absLine, h] of homeByAbsLine) {
    const away = awayByAbsLine.get(absLine);
    if (away !== undefined) pairs.push({ line: h.line, home: h.odds, away });
  }
  if (pairs.length === 0) return null;
  return pairs.reduce((best, cur) =>
    Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
  );
}

/** "Sets Handicap" — same real signed-line/multi-line shape as
 * extractGameHandicap above, but canonicalOutcome is "OTHER" (not HOME/
 * AWAY) and the side is instead a "1 "/"2 " prefix on rawName (1xBet's own
 * player-slot numbering: "1" = home, "2" = away — confirmed against real
 * moneyline data the same way extractGameHandicap's sign was). */
function extractSetHandicap(
  market: PulseScoreMarket,
): { line: number; home: number; away: number } | null {
  const homeByAbsLine = new Map<number, { line: number; odds: number }>();
  const awayByAbsLine = new Map<number, number>();
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const line = sel.line ?? market.line;
    if (line === undefined) continue;
    const raw = (sel.rawName || "").trim();
    const absLine = Math.abs(line);
    if (raw.startsWith("1")) homeByAbsLine.set(absLine, { line, odds: val });
    else if (raw.startsWith("2")) awayByAbsLine.set(absLine, val);
  }
  const pairs: Array<{ line: number; home: number; away: number }> = [];
  for (const [absLine, h] of homeByAbsLine) {
    const away = awayByAbsLine.get(absLine);
    if (away !== undefined) pairs.push({ line: h.line, home: h.odds, away });
  }
  if (pairs.length === 0) return null;
  return pairs.reduce((best, cur) =>
    Math.abs(cur.home - cur.away) < Math.abs(best.home - best.away) ? cur : best,
  );
}

/** Plain Yes/No market (canonicalOutcome "OTHER", rawName "Yes"/"No") —
 * used by Tie-Break and 1st set Tie-Break. */
function extractYesNo(market: PulseScoreMarket): { yes: number; no: number } | null {
  let yes: number | null = null;
  let no: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim().toLowerCase();
    if (raw === "yes") yes = val;
    else if (raw === "no") no = val;
  }
  return yes !== null && no !== null ? { yes, no } : null;
}

/** "Sets Scoring" / the 3-way half of "Highest Scoring Set Total" — rawNames
 * literally "1st Set > 2nd" / "1st Set < 2nd" / "1st Set = 2nd" (total games
 * per set compared, not who won it). */
function extractSetsScoring(
  market: PulseScoreMarket,
): { firstHigher: number; secondHigher: number; equal: number } | null {
  let firstHigher: number | null = null;
  let secondHigher: number | null = null;
  let equal: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim();
    if (raw === "1st Set > 2nd") firstHigher = val;
    else if (raw === "1st Set < 2nd") secondHigher = val;
    else if (raw === "1st Set = 2nd") equal = val;
  }
  return firstHigher !== null && secondHigher !== null && equal !== null
    ? { firstHigher, secondHigher, equal }
    : null;
}

/** Over/Under sub-selections found in several "OTHER"-bucketed markets
 * (Total Sets, Total Tie-Breaks, and the O/U half of "Highest Scoring Set
 * Total" alongside its 3-way "1st Set > 2nd" half — extractSetsScoring
 * above) — these carry canonicalOutcome "OTHER" too (not "OVER"/"UNDER"
 * like the properly-typed TOTAL_GAMES markets), so collectOverUnderLines'
 * canonicalOutcome check doesn't see them; parses the line and direction
 * out of rawName instead ("(2.5) Over"/"(0.5) Under"), same multi-line
 * collection + most-even-pick as collectOverUnderLines/pickMostEvenLine. */
function collectOtherTaggedOverUnderLines(
  market: PulseScoreMarket,
): Array<{ line: number; over: number; under: number }> {
  const byLine = new Map<number, { over: number | null; under: number | null }>();
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim();
    const m = raw.match(/^\((\d+(?:\.\d+)?)\)\s*(Over|Under)$/i);
    if (!m) continue;
    const line = Number(m[1]!);
    if (!Number.isFinite(line)) continue;
    const entry = byLine.get(line) ?? { over: null, under: null };
    if (/over/i.test(m[2]!)) entry.over = val;
    else entry.under = val;
    byLine.set(line, entry);
  }
  const out: Array<{ line: number; over: number; under: number }> = [];
  for (const [line, { over, under }] of byLine) {
    if (over !== null && under !== null) out.push({ line, over, under });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** "Set / Match" — rawNames "W1/W1"/"W1/W2"/"W2/W1"/"W2/W2" (who won set 1 /
 * who won the match; W1 = home, W2 = away). */
function extractSetMatch(
  market: PulseScoreMarket,
): { h11: number; h12: number; a21: number; a22: number } | null {
  let h11: number | null = null;
  let h12: number | null = null;
  let a21: number | null = null;
  let a22: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim();
    if (raw === "W1/W1") h11 = val;
    else if (raw === "W1/W2") h12 = val;
    else if (raw === "W2/W1") a21 = val;
    else if (raw === "W2/W2") a22 = val;
  }
  return h11 !== null && h12 !== null && a21 !== null && a22 !== null
    ? { h11, h12, a21, a22 }
    : null;
}

/** Picks the closest-to-even line (min |over - under| gap) as the "main"
 * line to show by default, same idea as a bookmaker's default O/U line —
 * only relevant when a market carries several lines (real sample: "1st Set
 * Total Games" priced 6 different lines; "Total Games 2-Way" priced 1). */
function pickMostEvenLine(
  lines: Array<{ line: number; over: number; under: number }>,
): { line: number; over: number; under: number } | undefined {
  if (lines.length === 0) return undefined;
  return lines.reduce((best, cur) =>
    Math.abs(cur.over - cur.under) < Math.abs(best.over - best.under) ? cur : best,
  );
}

/** Extracts the tennis-specific prematch markets beyond the moneyline
 * (already handled by extractTennisOverride/isMatchWinnerMarket above) from
 * one PulseScore tennis prematch event's full market list. GAME_HANDICAP/
 * SET_HANDICAP are deliberately NOT extracted here even though bwin's real
 * sample (2026-08-09) does carry explicit HOME/AWAY on both — out of scope
 * for this bookmaker switch, not a data-shape blocker; add when actually
 * requested. */
export function extractTennisPrematchExtra(
  ev: PulseScoreTennisPrematchEvent,
): PulseScoreTennisPrematchExtra {
  const out: PulseScoreTennisPrematchExtra = {};
  const markets = ev.markets ?? [];

  // bet365's Set 1 Winner is a dedicated "SET_WINNER" canonicalMarket
  // (period FIRST_SET, canonicalOutcome HOME/AWAY). bwin's real shape
  // (confirmed against a real /tennis/leagues sample, 2026-08-09, during the
  // brief bwin period — see this file's header) reuses canonicalMarket
  // "MATCH_RESULT" instead — same as the overall match winner —
  // differentiated only by period "FIRST_SET", with canonicalOutcome "OTHER"
  // and the player name in rawName rather than HOME/AWAY. Matching both
  // shapes costs nothing on bet365 (its markets are never canonicalMarket
  // "MATCH_RESULT" with period FIRST_SET) and keeps this working if bwin
  // gets retried later.
  const setWinner = markets.find(
    (m) =>
      (m.period || "").toUpperCase() === "FIRST_SET" &&
      (m.canonicalMarket === "SET_WINNER" || m.canonicalMarket === "MATCH_RESULT"),
  );
  if (setWinner) {
    let home: number | null = null;
    let away: number | null = null;
    for (const sel of setWinner.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      // bwin's Set Winner selections carry canonicalOutcome "OTHER" with the
      // player name in rawName instead of HOME/AWAY (unlike the overall
      // match winner market) — same fallback the moneyline extraction below
      // already uses for that case.
      if (sel.canonicalOutcome === "HOME") home = val;
      else if (sel.canonicalOutcome === "AWAY") away = val;
      else if (teamNamesMatch(sel.rawName, ev.home)) home = val;
      else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
    }
    if (home !== null && away !== null) out.firstSet = { home, away };
  }

  const totalGamesFull = markets.filter(
    (m) => m.canonicalMarket === "TOTAL_GAMES" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  const fullLines = collectOverUnderLines(totalGamesFull);
  if (fullLines.length > 0) {
    out.totalGamesLines = fullLines;
    out.totalGames = pickMostEvenLine(fullLines);
  }

  const totalGamesSet1 = markets.filter(
    (m) => m.canonicalMarket === "TOTAL_GAMES" && (m.period || "").toUpperCase() === "FIRST_SET",
  );
  const set1Lines = collectOverUnderLines(totalGamesSet1);
  if (set1Lines.length > 0) out.set1Games = pickMostEvenLine(set1Lines);

  const gameHandicapMarket = markets.find(
    (m) => m.canonicalMarket === "GAME_HANDICAP" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (gameHandicapMarket) {
    const gh = extractGameHandicap(gameHandicapMarket);
    if (gh) out.gameHandicap = gh;
  }

  const homeGamesMarket = markets.filter(
    (m) => m.canonicalMarket === "HOME_OVER_UNDER" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  const homeGamesLines = collectOverUnderLines(homeGamesMarket);
  if (homeGamesLines.length > 0) out.homePlayerGames = pickMostEvenLine(homeGamesLines);

  const awayGamesMarket = markets.filter(
    (m) => m.canonicalMarket === "AWAY_OVER_UNDER" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  const awayGamesLines = collectOverUnderLines(awayGamesMarket);
  if (awayGamesLines.length > 0) out.awayPlayerGames = pickMostEvenLine(awayGamesLines);

  const oddEvenMarket = markets.find(
    (m) =>
      m.canonicalMarket === "TOTAL_GOALS_ODD_EVEN" &&
      (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (oddEvenMarket) {
    let odd: number | null = null;
    let even: number | null = null;
    for (const sel of oddEvenMarket.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      if (sel.canonicalOutcome === "ODD") odd = val;
      else if (sel.canonicalOutcome === "EVEN") even = val;
    }
    if (odd !== null && even !== null) out.oddEvenGames = { odd, even };
  }

  // CORRECT_SCORE — confirmed real (2026-08-28 onexbet sample): a single
  // combined market, canonicalOutcome "OTHER", rawName literally the score
  // "2-0"/"2-1"/"0-2"/"1-2" (home sets - away sets, unambiguous, no
  // moreInfo/subMarket needed — much simpler than the old bet365/bwin
  // per-player SET_BETTING shape below, which never matched onexbet's
  // naming and is kept only as a dead fallback for a bookmaker revert).
  const correctScoreMarket = markets.find(
    (m) => m.canonicalMarket === "CORRECT_SCORE" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (correctScoreMarket) {
    let h20: number | null = null;
    let h21: number | null = null;
    let a02: number | null = null;
    let a12: number | null = null;
    for (const sel of correctScoreMarket.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const label = (sel.rawName || "").trim();
      if (label === "2-0") h20 = val;
      else if (label === "2-1") h21 = val;
      else if (label === "0-2") a02 = val;
      else if (label === "1-2") a12 = val;
    }
    if (h20 !== null && h21 !== null && a02 !== null && a12 !== null) {
      out.exactSets = { h20, h21, a02, a12 };
    }
  }

  // SET_BETTING: bet365 shape was one market PER PLAYER (moreInfo.subMarket
  // names which), each listing that player's own winning-score odds
  // ("2-0"/"2-1"). bwin's real sample (2026-08-09) has zero moreInfo and a
  // single combined SET_BETTING market listing all four outcomes
  // ("2-0"/"2-1"/"1-2"/"0-2") with no player attribution at all — the
  // subMarket check below now always finds "" and skips every bwin market.
  // Dead for onexbet (its market is CORRECT_SCORE, handled above); left as
  // a fallback only in case of a future bookmaker revert.
  if (!out.exactSets) {
    let h20: number | null = null;
    let h21: number | null = null;
    let a02: number | null = null;
    let a12: number | null = null;
    for (const m of markets) {
      if (m.canonicalMarket !== "SET_BETTING") continue;
      const subMarket = String(m.moreInfo?.["subMarket"] ?? "").trim();
      if (!subMarket) continue;
      const isHome = teamNamesMatch(subMarket, ev.home);
      const isAway = !isHome && teamNamesMatch(subMarket, ev.away);
      if (!isHome && !isAway) continue;
      for (const sel of m.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const label = (sel.rawName || "").trim();
        if (isHome && label === "2-0") h20 = val;
        else if (isHome && label === "2-1") h21 = val;
        else if (isAway && label === "2-0") a02 = val;
        else if (isAway && label === "2-1") a12 = val;
      }
    }
    if (h20 !== null && h21 !== null && a02 !== null && a12 !== null) {
      out.exactSets = { h20, h21, a02, a12 };
    }
  }

  const setHandicapMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Sets Handicap" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (setHandicapMarket) {
    const sh = extractSetHandicap(setHandicapMarket);
    if (sh) out.setHandicap = sh;
  }

  const tieBreakMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Tie-Break" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (tieBreakMarket) {
    const tb = extractYesNo(tieBreakMarket);
    if (tb) out.tieBreak = tb;
  }

  const tieBreak1stMarket = markets.find(
    (m) => (m.rawName || "").trim() === "1st set Tie-Break" && (m.period || "").toUpperCase() === "FIRST_SET",
  );
  if (tieBreak1stMarket) {
    const tb1 = extractYesNo(tieBreak1stMarket);
    if (tb1) out.tieBreak1st = tb1;
  }

  const totalTieBreaksMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Total Tie-Breaks" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (totalTieBreaksMarket) {
    const lines = collectOtherTaggedOverUnderLines(totalTieBreaksMarket);
    if (lines.length > 0) out.totalTieBreaks = pickMostEvenLine(lines);
  }

  const totalSetsMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Total Sets" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (totalSetsMarket) {
    const lines = collectOtherTaggedOverUnderLines(totalSetsMarket);
    if (lines.length > 0) out.totalSets = pickMostEvenLine(lines);
  }

  const highestSetMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Highest Scoring Set Total" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (highestSetMarket) {
    const lines = collectOtherTaggedOverUnderLines(highestSetMarket);
    if (lines.length > 0) out.highestSetTotal = pickMostEvenLine(lines);
    const scoring = extractSetsScoring(highestSetMarket);
    if (scoring) out.setsScoring = scoring;
  }
  if (!out.setsScoring) {
    const setsScoringMarket = markets.find(
      (m) => (m.rawName || "").trim() === "Sets Scoring" && (m.period || "").toUpperCase() === "FULL_TIME",
    );
    if (setsScoringMarket) {
      const scoring = extractSetsScoring(setsScoringMarket);
      if (scoring) out.setsScoring = scoring;
    }
  }

  const setMatchMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Set / Match" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (setMatchMarket) {
    const sm = extractSetMatch(setMatchMarket);
    if (sm) out.setMatch = sm;
  }

  return out;
}

// ── Live extra markets (real PulseScore data, not the synthetic
// computeLiveTennisExtras model in matches.ts) ──────────────────────────────
// Verified against a real GET /live-events?sport=tennis sample (2026-08-07,
// 11 live matches). These are plain field lookups — no probability model —
// so cheap enough to run on every live tick, unlike computeLiveTennisExtras
// (see its own comment in matches.ts for why THAT stays on-demand only).
//
// Confirmed live carries a materially different shape than the prematch
// /tennis/events sample extractTennisPrematchExtra above was built against:
// "Set 2/3 Winner" here is canonicalMarket "OTHER" with the set number only
// in rawName, not canonicalMarket "SET_WINNER" like prematch's first-set
// market — same kind of prematch-vs-live divergence already seen for the
// moneyline itself. Not assumed to also hold for prematch without its own
// confirmed sample, so this extractor is live-only for now.
//
// Deliberately excludes every handicap-shaped market ("Set N Handicap",
// "Match Handicap") — both selections carry canonicalOutcome "OTHER" with
// the player name only embedded in a free-text string ("Terence Atmane
// +1.5"), no structured HOME/AWAY field, same reasoning as GAME_HANDICAP
// above — and every ultra-granular in-play micro-market (score after N
// points, next break of serve, ace/double-fault totals, setcast, ...) as
// out of scope for a sportsbook's market list, not a real gap.
export type PulseScoreTennisLiveExtra = {
  set2?: { home: number; away: number };
  set3?: { home: number; away: number };
  set2Games?: { line: number; over: number; under: number };
  totalSets?: { line: number; over: number; under: number };
  straightSetsWinner?: { yes: number; no: number };
  goTheDistance?: { yes: number; no: number };
  oddEvenGames?: { odd: number; even: number };
  // Exact set score (e.g. "6-4"), one list per set. Label convention
  // matches the pre-existing score1st/score2nd/score3rd fields (already in
  // AdvancedMarkets["tennisExtra"], previously only ever synthetic): the
  // label is always "<home games>-<away games>" for THAT set, regardless of
  // who won it — so a home player winning 6-4 and an away player winning
  // 6-4 are two distinct labels, "6-4" and "4-6" respectively.
  score1st?: Array<{ label: string; odds: number }>;
  score2nd?: Array<{ label: string; odds: number }>;
  score3rd?: Array<{ label: string; odds: number }>;
  // Confirmed real in a live sample too (2026-08-28) — same canonicalMarket/
  // structured HOME/AWAY shape as prematch (extractGameHandicap/
  // collectOverUnderLines above), NOT the free-text-label shape the header
  // comment above warns "Set N Handicap"/"Match Handicap" carry — those are
  // a different, separate market this extractor still correctly ignores.
  gameHandicap?: { line: number; home: number; away: number };
  homePlayerGames?: { line: number; over: number; under: number };
  awayPlayerGames?: { line: number; over: number; under: number };
  exactSets?: { h20: number; h21: number; a02: number; a12: number };
  setHandicap?: { line: number; home: number; away: number };
  tieBreak?: { yes: number; no: number };
  tieBreak1st?: { yes: number; no: number };
  totalTieBreaks?: { line: number; over: number; under: number };
  highestSetTotal?: { line: number; over: number; under: number };
  setsScoring?: { firstHigher: number; secondHigher: number; equal: number };
  setMatch?: { h11: number; h12: number; a21: number; a22: number };
};

const TENNIS_SET_SCORE_ORDER = new Map([
  ["6-0", 0], ["6-1", 1], ["6-2", 2], ["6-3", 3], ["6-4", 4], ["7-5", 5], ["7-6", 6],
  ["0-6", 7], ["1-6", 8], ["2-6", 9], ["3-6", 10], ["4-6", 11], ["5-7", 12], ["6-7", 13],
]);

function reverseSetScoreLabel(label: string): string {
  const m = /^(\d+)-(\d+)$/.exec(label);
  if (!m) return label;
  return `${m[2]}-${m[1]}`;
}

/** Exact set score for one set. PulseScore represents this as a set of
 * inactive, zero-odds "label rows" (canonicalOutcome "OTHER", raw = the
 * score text, e.g. "6-4") each carrying a moreInfo.OR index, cross-
 * referenced against separate HOME/AWAY-attributed priced rows sharing that
 * same OR index — the priced row's own raw is the player's name, not the
 * score, so the label has to come from the matching placeholder row. */
function findSetScore(
  markets: PulseScoreMarket[],
  setNum: number,
): Array<{ label: string; odds: number }> | undefined {
  const re = new RegExp(`^set ${setNum} score$`, "i");
  const market = markets.find(
    (m) => m.canonicalMarket === "OTHER" && re.test((m.rawName || "").trim()),
  );
  if (!market) return undefined;

  const labelByOr = new Map<string, string>();
  for (const sel of market.selections ?? []) {
    if (sel.canonicalOutcome !== "OTHER") continue;
    const or = sel.moreInfo?.["OR"];
    const raw = (sel.rawName || "").trim();
    if (typeof or !== "string" && typeof or !== "number") continue;
    if (!/^\d-\d$/.test(raw)) continue;
    labelByOr.set(String(or), raw);
  }
  if (labelByOr.size === 0) return undefined;

  const out: Array<{ label: string; odds: number }> = [];
  for (const sel of market.selections ?? []) {
    if (sel.canonicalOutcome !== "HOME" && sel.canonicalOutcome !== "AWAY") continue;
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const or = sel.moreInfo?.["OR"];
    const baseLabel = labelByOr.get(String(or));
    if (!baseLabel) continue;
    const label = sel.canonicalOutcome === "HOME" ? baseLabel : reverseSetScoreLabel(baseLabel);
    out.push({ label, odds: val });
  }
  if (out.length === 0) return undefined;
  return out.sort(
    (a, b) => (TENNIS_SET_SCORE_ORDER.get(a.label) ?? 999) - (TENNIS_SET_SCORE_ORDER.get(b.label) ?? 999),
  );
}

function findSetWinnerByName(
  markets: PulseScoreMarket[],
  setNum: number,
): { home: number; away: number } | undefined {
  const re = new RegExp(`^set ${setNum} winner$`, "i");
  const market = markets.find(
    (m) => m.canonicalMarket === "OTHER" && re.test((m.rawName || "").trim()),
  );
  if (!market) return undefined;
  let home: number | null = null;
  let away: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    if (sel.canonicalOutcome === "HOME") home = val;
    else if (sel.canonicalOutcome === "AWAY") away = val;
  }
  return home !== null && away !== null ? { home, away } : undefined;
}

function findTotalGamesInSet(
  markets: PulseScoreMarket[],
  setNum: number,
): { line: number; over: number; under: number } | undefined {
  const re = new RegExp(`^total games in set ${setNum}$`, "i");
  const matching = markets.filter(
    (m) => m.canonicalMarket === "OTHER" && re.test((m.rawName || "").trim()),
  );
  return pickMostEvenLine(collectOverUnderLines(matching));
}

function findYesNoMarket(
  markets: PulseScoreMarket[],
  canonicalMarket: string,
  rawNameLower?: string,
): { yes: number; no: number } | undefined {
  const market = markets.find(
    (m) =>
      m.canonicalMarket === canonicalMarket &&
      (rawNameLower === undefined || (m.rawName || "").trim().toLowerCase() === rawNameLower),
  );
  if (!market) return undefined;
  let yes: number | null = null;
  let no: number | null = null;
  for (const sel of market.selections ?? []) {
    if (!sel.isActive) continue;
    const val = oddsToNumber(sel.odds);
    if (val === null) continue;
    const raw = (sel.rawName || "").trim().toLowerCase();
    if (raw === "yes") yes = val;
    else if (raw === "no") no = val;
  }
  return yes !== null && no !== null ? { yes, no } : undefined;
}

export function extractTennisLiveExtra(ev: PulseScoreEvent): PulseScoreTennisLiveExtra {
  const markets = ev.markets ?? [];
  const out: PulseScoreTennisLiveExtra = {};

  const set2 = findSetWinnerByName(markets, 2);
  if (set2) out.set2 = set2;
  const set3 = findSetWinnerByName(markets, 3);
  if (set3) out.set3 = set3;

  const set2Games = findTotalGamesInSet(markets, 2);
  if (set2Games) out.set2Games = set2Games;

  const totalSetsMarket = markets.find((m) => m.canonicalMarket === "TOTAL_SETS");
  if (totalSetsMarket) {
    let twoSets: number | null = null;
    let threeSets: number | null = null;
    for (const sel of totalSetsMarket.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const raw = (sel.rawName || "").trim().toLowerCase();
      if (raw === "2 sets") twoSets = val;
      else if (raw === "3 sets") threeSets = val;
    }
    if (twoSets !== null && threeSets !== null) {
      out.totalSets = { line: 2.5, under: twoSets, over: threeSets };
    }
  }
  // Fallback: confirmed real onexbet shape (2026-08-28) is actually rawName
  // "Total Sets" under canonicalMarket "OTHER" ("(2.5) Over"/"(2.5) Under"),
  // not the canonicalMarket "TOTAL_SETS"/"2 sets"/"3 sets" shape above (kept
  // for whichever bookmaker era that was confirmed against).
  if (!out.totalSets) {
    const altTotalSetsMarket = markets.find(
      (m) => (m.rawName || "").trim() === "Total Sets" && (m.period || "").toUpperCase() === "FULL_TIME",
    );
    if (altTotalSetsMarket) {
      const lines = collectOtherTaggedOverUnderLines(altTotalSetsMarket);
      if (lines.length > 0) out.totalSets = pickMostEvenLine(lines);
    }
  }

  const setHandicapMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Sets Handicap" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (setHandicapMarket) {
    const sh = extractSetHandicap(setHandicapMarket);
    if (sh) out.setHandicap = sh;
  }

  const tieBreakMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Tie-Break" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (tieBreakMarket) {
    const tb = extractYesNo(tieBreakMarket);
    if (tb) out.tieBreak = tb;
  }

  const tieBreak1stMarket = markets.find(
    (m) => (m.rawName || "").trim() === "1st set Tie-Break" && (m.period || "").toUpperCase() === "FIRST_SET",
  );
  if (tieBreak1stMarket) {
    const tb1 = extractYesNo(tieBreak1stMarket);
    if (tb1) out.tieBreak1st = tb1;
  }

  const totalTieBreaksMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Total Tie-Breaks" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (totalTieBreaksMarket) {
    const lines = collectOtherTaggedOverUnderLines(totalTieBreaksMarket);
    if (lines.length > 0) out.totalTieBreaks = pickMostEvenLine(lines);
  }

  const highestSetMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Highest Scoring Set Total" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (highestSetMarket) {
    const lines = collectOtherTaggedOverUnderLines(highestSetMarket);
    if (lines.length > 0) out.highestSetTotal = pickMostEvenLine(lines);
    const scoring = extractSetsScoring(highestSetMarket);
    if (scoring) out.setsScoring = scoring;
  }
  if (!out.setsScoring) {
    const setsScoringMarket = markets.find(
      (m) => (m.rawName || "").trim() === "Sets Scoring" && (m.period || "").toUpperCase() === "FULL_TIME",
    );
    if (setsScoringMarket) {
      const scoring = extractSetsScoring(setsScoringMarket);
      if (scoring) out.setsScoring = scoring;
    }
  }

  const setMatchMarket = markets.find(
    (m) => (m.rawName || "").trim() === "Set / Match" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (setMatchMarket) {
    const sm = extractSetMatch(setMatchMarket);
    if (sm) out.setMatch = sm;
  }

  const straightSets = findYesNoMarket(markets, "OTHER", "straight sets winner?");
  if (straightSets) out.straightSetsWinner = straightSets;

  const goDistance = findYesNoMarket(markets, "GO_THE_DISTANCE");
  if (goDistance) out.goTheDistance = goDistance;

  const oddEvenMarket = markets.find(
    (m) =>
      m.canonicalMarket === "OTHER" &&
      (m.rawName || "").trim().toLowerCase() === "match total games odd/even",
  );
  if (oddEvenMarket) {
    let odd: number | null = null;
    let even: number | null = null;
    for (const sel of oddEvenMarket.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const raw = (sel.rawName || "").trim().toLowerCase();
      if (raw === "odd") odd = val;
      else if (raw === "even") even = val;
    }
    if (odd !== null && even !== null) out.oddEvenGames = { odd, even };
  }

  const score1st = findSetScore(markets, 1);
  if (score1st) out.score1st = score1st;
  const score2nd = findSetScore(markets, 2);
  if (score2nd) out.score2nd = score2nd;
  const score3rd = findSetScore(markets, 3);
  if (score3rd) out.score3rd = score3rd;

  const gameHandicapMarket = markets.find(
    (m) => m.canonicalMarket === "GAME_HANDICAP" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (gameHandicapMarket) {
    const gh = extractGameHandicap(gameHandicapMarket);
    if (gh) out.gameHandicap = gh;
  }

  const homeGamesMarket = markets.filter(
    (m) => m.canonicalMarket === "HOME_OVER_UNDER" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  const homeGamesLines = collectOverUnderLines(homeGamesMarket);
  if (homeGamesLines.length > 0) out.homePlayerGames = pickMostEvenLine(homeGamesLines);

  const awayGamesMarket = markets.filter(
    (m) => m.canonicalMarket === "AWAY_OVER_UNDER" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  const awayGamesLines = collectOverUnderLines(awayGamesMarket);
  if (awayGamesLines.length > 0) out.awayPlayerGames = pickMostEvenLine(awayGamesLines);

  const correctScoreMarket = markets.find(
    (m) => m.canonicalMarket === "CORRECT_SCORE" && (m.period || "").toUpperCase() === "FULL_TIME",
  );
  if (correctScoreMarket) {
    let h20: number | null = null;
    let h21: number | null = null;
    let a02: number | null = null;
    let a12: number | null = null;
    for (const sel of correctScoreMarket.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const label = (sel.rawName || "").trim();
      if (label === "2-0") h20 = val;
      else if (label === "2-1") h21 = val;
      else if (label === "0-2") a02 = val;
      else if (label === "1-2") a12 = val;
    }
    if (h20 !== null && h21 !== null && a02 !== null && a12 !== null) {
      out.exactSets = { h20, h21, a02, a12 };
    }
  }

  return out;
}
