// MMA prematch odds from PulseScore, bookmaker "unibetau" (distinct from
// bet365/fanduel/bwin/draftkings/paddypower already used elsewhere — its own
// independent 1 req/s rate-limit budget). Prematch only for now: the only
// endpoint verified against real data is /mma/leagues (paginated by league,
// each league carries its own nested events[] with no live/finished status
// worth trusting — every sampled event had "live": false). No live-events
// endpoint has been tested for MMA yet — explicit scoping decision,
// confirmed with the user 2026-08-05, same phased approach used for other
// sports (prematch first, live is a separate follow-up once verified).
//
// Verified against a real authenticated GET /api/unibetau/mma/leagues call
// (2026-08-05): trust this file's shapes over any public docs.
import { CONFIG } from "../../lib/config.js";
import { pulseScoreGet } from "./client.js";

const MMA_BOOKMAKER = "unibetau";

export type MmaSelection = {
  canonicalOutcome: string; // "HOME" | "AWAY" | "YES" | "NO" | "OVER" | "UNDER" | ...
  rawName: string;
  odds: number;
  isActive: boolean;
  line?: number;
  selectionId?: string;
  moreInfo?: { participant?: string; participantId?: string; [key: string]: unknown };
};

export type MmaMarket = {
  canonicalMarket: string; // "MATCH_RESULT" | "OTHER" | "OVER_UNDER" seen in real data
  rawName: string; // "Bout Odds" | "To go the distance" | "Total Rounds" seen in real data
  period: string;
  isActive: boolean;
  line?: number; // also present per-selection; per-selection is authoritative here
  selections: MmaSelection[];
  marketId: string;
};

export type MmaEvent = {
  sport: string;
  country: string;
  league: string;
  eventId: string;
  home: string;
  away: string;
  live: boolean;
  startTime: string; // ISO
  markets: MmaMarket[];
};

type MmaLeague = {
  name: string;
  sport: string;
  country: string;
  events: MmaEvent[];
  leagueId: string;
};

type MmaLeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  leagues: MmaLeague[];
};

const MMA_TTL_MS = 30_000;
let cache: { events: MmaEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<MmaEvent[]> | null = null;

async function fetchAllMmaLeagues(): Promise<MmaLeague[]> {
  const leagues: MmaLeague[] = [];
  let page = 1;
  // Real sample showed total: 1 (just "UFC") — this loop only matters if
  // PulseScore's unibetau coverage grows beyond a single league later.
  for (let i = 0; i < 20; i++) {
    const data = await pulseScoreGet<MmaLeaguesResponse>(
      `/mma/leagues?page=${page}&limit=30`,
      6_000,
      MMA_BOOKMAKER,
    );
    if (Array.isArray(data?.leagues)) leagues.push(...data.leagues);
    if (!data?.hasNextPage) break;
    page += 1;
  }
  return leagues;
}

async function fetchMmaEvents(): Promise<MmaEvent[]> {
  try {
    const leagues = await fetchAllMmaLeagues();
    return leagues.flatMap((l) => l.events ?? []);
  } catch {
    return [];
  }
}

/** Upcoming MMA fights from PulseScore. Empty if PULSESCORE_API_KEY isn't
 * configured or the upstream call fails. */
export async function getPulseScoreMmaUpcoming(): Promise<MmaEvent[]> {
  if (!CONFIG.PULSESCORE_API_KEY) return [];
  const now = Date.now();
  if (cache && now - cache.fetchedAt < MMA_TTL_MS) return cache.events;
  if (!inFlight) {
    inFlight = fetchMmaEvents()
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

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
}

export type MmaMarketsExtracted = {
  odds?: { home: number; away: number };
  toDistance?: { yes: number; no: number };
  totalRoundsLines?: Array<{ line: number; over: number; under: number }>;
};

/** Extracts the three confirmed-real MMA markets from one event: moneyline
 * (canonicalMarket MATCH_RESULT), "to go the distance" (identified by
 * rawName — no dedicated canonicalMarket, comes back as OTHER), and total
 * rounds O/U (canonicalMarket OVER_UNDER, one line per fight — 1.5/2.5/3.5
 * observed across different real fights). */
export function extractMmaMarkets(ev: MmaEvent): MmaMarketsExtracted {
  const out: MmaMarketsExtracted = {};
  for (const market of ev.markets ?? []) {
    if (market.canonicalMarket === "MATCH_RESULT") {
      let home: number | null = null;
      let away: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "HOME") home = val;
        else if (sel.canonicalOutcome === "AWAY") away = val;
      }
      if (home !== null && away !== null) out.odds = { home, away };
    } else if ((market.rawName || "").toLowerCase().includes("go the distance")) {
      let yes: number | null = null;
      let no: number | null = null;
      for (const sel of market.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "YES") yes = val;
        else if (sel.canonicalOutcome === "NO") no = val;
      }
      if (yes !== null && no !== null) out.toDistance = { yes, no };
    } else if (
      market.canonicalMarket === "OVER_UNDER" &&
      (market.rawName || "").toLowerCase().includes("total rounds")
    ) {
      const byLine = new Map<number, { over: number | null; under: number | null }>();
      for (const sel of market.selections ?? []) {
        if (!sel.isActive || sel.line === undefined) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        const entry = byLine.get(sel.line) ?? { over: null, under: null };
        if (sel.canonicalOutcome === "OVER") entry.over = val;
        else if (sel.canonicalOutcome === "UNDER") entry.under = val;
        byLine.set(sel.line, entry);
      }
      const lines: Array<{ line: number; over: number; under: number }> = [];
      for (const [line, { over, under }] of byLine) {
        if (over !== null && under !== null) lines.push({ line, over, under });
      }
      if (lines.length > 0) {
        out.totalRoundsLines = lines.sort((a, b) => a.line - b.line);
      }
    }
  }
  return out;
}
