// Football live odds from PulseScore, polled via REST (the WebSocket's one
// PRO-plan connection is dedicated to tennis instead — see tennisWs.ts).
// Same in-process cache + in-flight-dedup shape already used throughout
// matches.ts for other ~1s live polls (e.g. TENNIS_LIVE_V1_TTL).
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { pulseScoreGet, type PulseScoreEvent } from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

const FOOTBALL_LIVE_TTL_MS = 1_000; // matches the PRO plan's 1 req/s rate limit

let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<PulseScoreEvent[]> | null = null;

// PulseScore has no equivalent of Statpal's /user-request-count endpoint to
// query usage from their side, so we count our own outbound calls instead —
// resets at UTC midnight, same "requests today" shape the Statpal usage
// admin card already shows.
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

export function getPulseScoreFootballUsage(): {
  requestsToday: number;
  date: string;
} {
  rollUsageDateIfNeeded();
  return { requestsToday, date: usageDate };
}

async function fetchFootballLive(): Promise<PulseScoreEvent[]> {
  rollUsageDateIfNeeded();
  requestsToday += 1;
  try {
    const data = await pulseScoreGet<PulseScoreEvent[]>(
      "/live-events?sport=soccer",
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Live football odds from PulseScore (bet365, normalized). Empty array if
 * PULSESCORE_API_KEY isn't configured yet or the upstream call fails. */
export async function getPulseScoreFootballLive(): Promise<PulseScoreEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];

  const now = Date.now();
  if (cache && now - cache.fetchedAt < FOOTBALL_LIVE_TTL_MS) return cache.events;

  if (!inFlight) {
    inFlight = fetchFootballLive()
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

// ── canonicalMarket → our own market shape ──────────────────────────────────
// PulseScore's docs only document two canonicalMarket values by example
// (match_winner, total_goals) — there's no exhaustive list. Rather than
// guess names for the rest (correctScore, handicap, btts, ...) and risk
// silently mis-mapping odds, only these two are wired in for now; any other
// canonicalMarket seen in real traffic is logged once (see
// recordUnknownCanonicalMarket below) so the mapping can be safely extended
// from what PulseScore actually sends, not from guesswork.
export type TotalGoalsOverride = Partial<{
  over05: number; under05: number;
  over15: number; under15: number;
  over25: number; under25: number;
  over35: number; under35: number;
  over45: number; under45: number;
  over55: number; under55: number;
  over65: number; under65: number;
}>;

export type PulseScoreFootballOverride = {
  odds?: { home: number; draw: number; away: number };
  totalGoals?: TotalGoalsOverride;
};

const TOTAL_GOALS_LINE_KEYS: Record<string, { over: keyof TotalGoalsOverride; under: keyof TotalGoalsOverride }> = {
  "0.5": { over: "over05", under: "under05" },
  "1.5": { over: "over15", under: "under15" },
  "2.5": { over: "over25", under: "under25" },
  "3.5": { over: "over35", under: "under35" },
  "4.5": { over: "over45", under: "under45" },
  "5.5": { over: "over55", under: "under55" },
  "6.5": { over: "over65", under: "under65" },
};

const seenUnknownMarkets = new Set<string>();
function recordUnknownCanonicalMarket(canonicalMarket: string): void {
  if (seenUnknownMarkets.has(canonicalMarket)) return;
  seenUnknownMarkets.add(canonicalMarket);
  logger.info(
    { canonicalMarket },
    "[pulsescore] unmapped football canonicalMarket seen — candidate to add to the override mapping",
  );
}

function decimalToNumber(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1.0 ? n : null;
}

/** Builds a market override from one PulseScore event's known canonical
 * markets (match_winner, total_goals — fulltime only). Returns an empty
 * object (not null) when the event has no fulltime markets recognised yet —
 * callers should only apply the fields that are actually present. */
function extractFootballOverride(ev: PulseScoreEvent): PulseScoreFootballOverride {
  const out: PulseScoreFootballOverride = {};
  for (const market of ev.markets ?? []) {
    if (market.period !== "fulltime") continue;
    if (market.canonicalMarket === "match_winner") {
      let home: number | null = null;
      let draw: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        const val = decimalToNumber(sel.decimal);
        if (val === null) continue;
        if (teamNamesMatch(sel.name, ev.home)) home = val;
        else if (teamNamesMatch(sel.name, ev.away)) away = val;
        else draw = val; // whatever's left over (usually literally "Draw")
      }
      if (home !== null && draw !== null && away !== null) {
        out.odds = { home, draw, away };
      }
    } else if (market.canonicalMarket === "total_goals") {
      const lineKeys = market.line ? TOTAL_GOALS_LINE_KEYS[market.line] : undefined;
      if (!lineKeys) continue;
      let over: number | null = null;
      let under: number | null = null;
      for (const sel of market.selections ?? []) {
        const val = decimalToNumber(sel.decimal);
        if (val === null) continue;
        const nameLow = sel.name.toLowerCase();
        if (nameLow.startsWith("over")) over = val;
        else if (nameLow.startsWith("under")) under = val;
      }
      if (over !== null && under !== null) {
        out.totalGoals = {
          ...out.totalGoals,
          [lineKeys.over]: over,
          [lineKeys.under]: under,
        };
      }
    } else {
      recordUnknownCanonicalMarket(market.canonicalMarket);
    }
  }
  return out;
}

/** Finds the PulseScore live event matching a tracked match by team name
 * (tolerant cross-provider match, same approach as the existing Statpal ↔
 * SportScore matcher) and returns its market override, if any. `events`
 * should be one already-fetched getPulseScoreFootballLive() batch — never
 * call this per-match, it would blow the 1 req/s PRO rate limit. */
export function findPulseScoreFootballOverride(
  home: string,
  away: string,
  events: PulseScoreEvent[],
): PulseScoreFootballOverride | null {
  const ev = events.find(
    (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
  );
  if (!ev) return null;
  const override = extractFootballOverride(ev);
  return override.odds || override.totalGoals ? override : null;
}
