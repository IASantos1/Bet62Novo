// Tennis live odds from PulseScore — WebSocket primary, REST fallback.
//
// WS was tried once before (2026-08-05) and removed because the connection
// never produced a single confirmed frame (see git history commit ede487a).
// Reintroduced 2026-08-07 against PulseScore's own published connection-
// pattern docs, which confirm the URL shape (wss://.../v3/bet365/ws/live?
// key=...&sport=tennis) was already right — see tennisWs.ts's header for the
// full story. To avoid repeating a silent failure, getPulseScoreTennisLive()
// below only trusts the WS source while tennisWsIsFresh() is true (a real
// frame arrived recently); otherwise it transparently falls back to the REST
// poll that was the sole source until today. Both paths return the exact
// same PulseScoreEvent[] shape, so every downstream consumer
// (extractTennisOverride, buildTennisLiveFromPulseScore in matches.ts) is
// unaffected by which one served a given tick.
//
// REST shares the bet365 bookmaker with football.ts (the only bookmaker
// confirmed to carry tennis, via the real /tennis/leagues sample that
// revealed the DRAW_NO_BET market) rather than a distinct bookmaker prefix
// like basketball/hockey/baseball/volleyball use — picking an unconfirmed
// bookmaker name for tennis would repeat the exact mistake this integration
// keeps having to correct. Since bet365's PRO-plan budget is 1 req/s shared
// with football, REST polls at a slightly longer interval than football's
// 1000ms to reduce (not eliminate) collision — an occasional 429 just means
// serving the last good cache for that tick, not a crash (same
// catch-and-fall-back shape as every other PulseScore fetch here). WS runs
// on its own separate connection, entirely outside that shared REST budget.
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
import { getTennisWsEvents, tennisWsIsFresh } from "./tennisWs.js";

const TENNIS_LIVE_TTL_MS = 1_500;
// How stale the last WS frame is allowed to be before falling back to REST.
// Generous enough to ride out a single dropped/delayed frame, tight enough
// that a truly dead connection (the 2026-08-05 failure mode) falls back
// within a couple of ticks instead of serving stale WS data indefinitely.
const TENNIS_WS_FRESHNESS_MS = 5_000;

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
  );
  return Array.isArray(data?.events) ? data.events : [];
}

async function getPulseScoreTennisLiveRest(): Promise<PulseScoreEvent[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TENNIS_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchTennisLive()
      .then((events) => {
        cache = { events, fetchedAt: Date.now() };
        return events;
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
  }
  return inFlight;
}

/** Live tennis odds from PulseScore (bet365, normalized). WS-sourced
 * whenever a frame has arrived in the last TENNIS_WS_FRESHNESS_MS; REST
 * otherwise. Empty array if PULSESCORE_API_KEY isn't configured yet or
 * both sources are currently unavailable. */
export async function getPulseScoreTennisLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  if (tennisWsIsFresh(TENNIS_WS_FRESHNESS_MS)) return getTennisWsEvents();
  return getPulseScoreTennisLiveRest();
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
};

function collectOverUnderLines(
  markets: PulseScoreMarket[],
): Array<{ line: number; over: number; under: number }> {
  const byLine = new Map<number, { over: number | null; under: number | null }>();
  for (const m of markets) {
    for (const sel of m.selections ?? []) {
      if (!sel.isActive || sel.line === undefined) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      const entry = byLine.get(sel.line) ?? { over: null, under: null };
      if (sel.canonicalOutcome === "OVER") entry.over = val;
      else if (sel.canonicalOutcome === "UNDER") entry.under = val;
      byLine.set(sel.line, entry);
    }
  }
  const out: Array<{ line: number; over: number; under: number }> = [];
  for (const [line, { over, under }] of byLine) {
    if (over !== null && under !== null) out.push({ line, over, under });
  }
  return out.sort((a, b) => a.line - b.line);
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
 * one PulseScore tennis prematch event's full market list. GAME_HANDICAP is
 * deliberately NOT extracted here — its two selections both carry
 * canonicalOutcome "OTHER" with no HOME/AWAY (or team-name) attribution
 * anywhere in the real sample, unlike every other 2-way market in this
 * response (MATCH_RESULT, SET_WINNER both use explicit HOME/AWAY). Getting
 * a real-money handicap side backwards is a correctness bug that actually
 * hurts a bettor, not just a cosmetic miss — needs a real sample that
 * disambiguates it before being added. */
export function extractTennisPrematchExtra(
  ev: PulseScoreTennisPrematchEvent,
): PulseScoreTennisPrematchExtra {
  const out: PulseScoreTennisPrematchExtra = {};
  const markets = ev.markets ?? [];

  const setWinner = markets.find(
    (m) => m.canonicalMarket === "SET_WINNER" && (m.period || "").toUpperCase() === "FIRST_SET",
  );
  if (setWinner) {
    let home: number | null = null;
    let away: number | null = null;
    for (const sel of setWinner.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      if (sel.canonicalOutcome === "HOME") home = val;
      else if (sel.canonicalOutcome === "AWAY") away = val;
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

  // SET_BETTING: one market PER PLAYER (moreInfo.subMarket names which),
  // each listing that player's own winning-score odds ("2-0"/"2-1"). Safe
  // to attribute by matching the player's name, not by position.
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

  return out;
}
