import { teamNamesMatch } from "../pulsescore/teamMatch.js";
import { getBetbySession } from "./session.js";
import {
  getFootballWsEventIfFresh,
  getFootballWsEvents,
  footballWsIsFresh,
} from "../pulsescore/footballWs.js";
import {
  getTennisWsEventIfFresh,
  getTennisWsEvents,
  tennisWsIsFresh,
} from "../pulsescore/tennisWs.js";
import {
  getBasketballWsEventIfFresh,
  getBasketballWsEvents,
  basketballWsIsFresh,
} from "../pulsescore/basketballWs.js";
import {
  getHockeyWsEventIfFresh,
  getHockeyWsEvents,
  hockeyWsIsFresh,
} from "../pulsescore/hockeyWs.js";
import {
  getVolleyballWsEventIfFresh,
  getVolleyballWsEvents,
  volleyballWsIsFresh,
} from "../pulsescore/volleyballWs.js";
import type { PulseScoreEvent } from "../pulsescore/client.js";
import { logger } from "../../lib/logger.js";

export type BetbyMatchMeta = {
  betbyEventId: string;
  sportId: string; // "1" = futebol, "2" = tenis, "3" = basquete (BetBY standard)
  sportName?: string;
  homeName: string;
  awayName: string;
  tournamentName?: string;
  leagueName?: string;
};

export type PulseMatchSnapshot = {
  source: "pulsescore";
  pulseEventId: string | null;
  matchedBy: "sport+home+away" | "sport+home" | "sport+away" | "none";
  confidence: 0 | 1 | 2 | 3;
  home: string;
  away: string;
  score: { home: string; away: string } | null;
  minute: number | null;
  period: string | null;
  running: boolean | null;
  updatedAtMs: number;
  live: boolean;
};

export const BETBY_SPORT_ID_TO_PULSE_SPORT: Record<string, string> = {
  "1": "soccer",
  "2": "tennis",
  "4": "basketball",
  "5": "basketball",
  "6": "basketball",
  "12": "volleyball",
  "14": "tennis",
  "17": "basketball",
  "27": "basketball",
  "20": "hockey",
  "25": "soccer",
  "28": "soccer",
};

export const BETBY_SPORT_ID_TO_WS_GETTERS: Record<
  string,
  {
    all: () => PulseScoreEvent[];
    fresh: (id: string, age: number) => PulseScoreEvent | null;
    isFresh: (age: number) => boolean;
    pulseSport: string;
  }
> = {
  "1": {
    all: getFootballWsEvents,
    fresh: getFootballWsEventIfFresh,
    isFresh: footballWsIsFresh,
    pulseSport: "soccer",
  },
  "4": {
    all: getBasketballWsEvents,
    fresh: getBasketballWsEventIfFresh,
    isFresh: basketballWsIsFresh,
    pulseSport: "basketball",
  },
  "2": {
    all: getTennisWsEvents,
    fresh: getTennisWsEventIfFresh,
    isFresh: tennisWsIsFresh,
    pulseSport: "tennis",
  },
  "14": {
    all: getTennisWsEvents,
    fresh: getTennisWsEventIfFresh,
    isFresh: tennisWsIsFresh,
    pulseSport: "tennis",
  },
  "17": {
    all: getBasketballWsEvents,
    fresh: getBasketballWsEventIfFresh,
    isFresh: basketballWsIsFresh,
    pulseSport: "basketball",
  },
  "27": {
    all: getBasketballWsEvents,
    fresh: getBasketballWsEventIfFresh,
    isFresh: basketballWsIsFresh,
    pulseSport: "basketball",
  },
  "5": {
    all: getBasketballWsEvents,
    fresh: getBasketballWsEventIfFresh,
    isFresh: basketballWsIsFresh,
    pulseSport: "basketball",
  },
  "6": {
    all: getBasketballWsEvents,
    fresh: getBasketballWsEventIfFresh,
    isFresh: basketballWsIsFresh,
    pulseSport: "basketball",
  },
  "20": {
    all: getHockeyWsEvents,
    fresh: getHockeyWsEventIfFresh,
    isFresh: hockeyWsIsFresh,
    pulseSport: "hockey",
  },
  "12": {
    all: getVolleyballWsEvents,
    fresh: getVolleyballWsEventIfFresh,
    isFresh: volleyballWsIsFresh,
    pulseSport: "volleyball",
  },
  "25": {
    all: getFootballWsEvents,
    fresh: getFootballWsEventIfFresh,
    isFresh: footballWsIsFresh,
    pulseSport: "soccer",
  },
  "28": {
    all: getFootballWsEvents,
    fresh: getFootballWsEventIfFresh,
    isFresh: footballWsIsFresh,
    pulseSport: "soccer",
  },
};

const BETBY_LANG = process.env.BETBY_LANG_DEFAULT ?? "en";
const BETBY_BRAND_ID = process.env.BETBY_BRAND_ID || "1653815133341880320";
// Fallback host, only used if no Playwright session has ever been captured
// yet (first-ever call, capture still in flight) — kept as demoapi.betby.com
// since that's still what BETBY_API_HOST historically documented, even
// though the confirmed real host (api-h-c7818b61-608.sptpub.com in the one
// manual capture this was built against) is dynamically discovered per
// session now, not a fixed value. An explicit BETBY_API_HOST env var still
// wins outright — set it to skip Playwright entirely if the real host turns
// out to be stable enough to pin.
const BETBY_FALLBACK_HOST = process.env.BETBY_API_HOST || "demoapi.betby.com";

const seenUnknownShapes = new Set<string>();
function recordUnknownBetbyShape(context: string, body: unknown): void {
  if (seenUnknownShapes.has(context)) return;
  seenUnknownShapes.add(context);
  logger.warn(
    { context, sample: JSON.stringify(body).slice(0, 2000) },
    "[pulseBridge] unrecognized BetBY response shape — logging raw sample to confirm real field names",
  );
}

/** Fetches a BetBY API path using the real (Playwright-captured) session
 * when available — real host, real auth headers — falling back to
 * BETBY_FALLBACK_HOST with no auth (the old behavior) only when no session
 * has been captured yet. Retries once with a forced session refresh on a
 * 401/403, since that's the concrete signal the cached headers stopped
 * being valid (session expired, brand rotated hosts, etc.) rather than
 * "this match/endpoint genuinely doesn't exist". */
async function fetchBetbyJson(path: string, timeoutMs: number): Promise<unknown | null> {
  const attempt = async (forceRefresh: boolean): Promise<{ status: number; body: unknown } | null> => {
    const session = await getBetbySession(forceRefresh);
    const host = session?.apiHost ?? BETBY_FALLBACK_HOST;
    const url = `https://${host}${path}`;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
          ...(session?.headers ?? {}),
        },
        signal: controller.signal,
        redirect: "follow",
      });
      if (res.status === 401 || res.status === 403) return { status: res.status, body: null };
      if (!res.ok) {
        logger.warn({ url, status: res.status }, "[pulseBridge] BetBY fetch non-OK");
        return { status: res.status, body: null };
      }
      return { status: res.status, body: await res.json() };
    } catch (err) {
      logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, "[pulseBridge] BetBY fetch failed");
      return null;
    } finally {
      clearTimeout(to);
    }
  };
  const first = await attempt(false);
  if (first && (first.status === 401 || first.status === 403)) {
    const retried = await attempt(true);
    return retried?.body ?? null;
  }
  return first?.body ?? null;
}

/** Best-effort extraction of {home, away} team names from a BetBY event
 * object — tries every shape this integration has seen or plausibly could
 * see (the old /api/v4/live "desc.competitors" array shape, and several
 * guesses at what the /api/v3/descriptions "teams, competition, state"
 * shape a fully-authenticated request should return per the real BetBY
 * flow — not independently confirmed, see this file's session.ts). Never
 * throws; returns null on anything unrecognized. */
export function extractTeamNames(ev: unknown): { home: string; away: string } | null {
  if (!ev || typeof ev !== "object") return null;
  const o = ev as Record<string, unknown>;
  const desc = (o["desc"] ?? o) as Record<string, unknown>;
  const competitorsCandidates: unknown[] = [
    desc["competitors"],
    (desc["state"] as Record<string, unknown> | undefined)?.["competitors"],
    (desc["event"] as Record<string, unknown> | undefined)?.["competitors"],
    (desc["info"] as Record<string, unknown> | undefined)?.["competitors"],
    o["teams"],
  ];
  for (const candidate of competitorsCandidates) {
    if (Array.isArray(candidate) && candidate.length >= 2) {
      const home = (candidate[0] as Record<string, unknown>)?.["name"];
      const away = (candidate[1] as Record<string, unknown>)?.["name"];
      if (typeof home === "string" && typeof away === "string" && home && away) {
        return { home, away };
      }
    }
  }
  const flatHome = desc["home"] ?? desc["homeTeam"] ?? (desc["teams"] as Record<string, unknown> | undefined)?.["home"];
  const flatAway = desc["away"] ?? desc["awayTeam"] ?? (desc["teams"] as Record<string, unknown> | undefined)?.["away"];
  const homeName = typeof flatHome === "string" ? flatHome : (flatHome as Record<string, unknown> | undefined)?.["name"];
  const awayName = typeof flatAway === "string" ? flatAway : (flatAway as Record<string, unknown> | undefined)?.["name"];
  if (typeof homeName === "string" && typeof awayName === "string" && homeName && awayName) {
    return { home: homeName, away: awayName };
  }
  return null;
}

/** GET /api/v3/descriptions/brand/{brandId}/event/{eventId}/{lang} — real,
 * confirmed-reachable endpoint (manually captured 2026-08-16 against a
 * real live match). Its unauthenticated shape only exposes {players,
 * markets}; per the real BetBY flow this was reverse-engineered from, a
 * properly authenticated request additionally carries teams/competition/
 * state, which is what this needs — see session.ts for how auth is
 * obtained. */
export async function resolveBetbyMatchMeta(
  betbyEventId: string,
  timeoutMs = 5500,
): Promise<BetbyMatchMeta | null> {
  const path = `/api/v3/descriptions/brand/${BETBY_BRAND_ID}/event/${betbyEventId}/${BETBY_LANG}`;
  const body = await fetchBetbyJson(path, timeoutMs);
  if (body == null) return null;
  const teams = extractTeamNames(body);
  if (!teams) {
    recordUnknownBetbyShape("descriptions", body);
    return null;
  }
  const o = body as Record<string, unknown>;
  const desc = (o["desc"] ?? o) as Record<string, unknown>;
  const sportId = String(desc["sport"] ?? "1");
  return {
    betbyEventId,
    sportId,
    homeName: teams.home,
    awayName: teams.away,
    tournamentName: typeof desc["tournamentName"] === "string" ? (desc["tournamentName"] as string) : undefined,
    leagueName: typeof desc["categoryName"] === "string" ? (desc["categoryName"] as string) : undefined,
  };
}

// ─── Auto-discovery: PulseScore ↔ BetBY live-event matching, any sport ────
// User request 2026-08-13: the Tracker should work for ANY match that goes
// live, any sport, without needing an admin to hand-map every fixture in
// live_stream_mappings first.
//
// Corrected 2026-08-16: this used to call demoapi.betby.com/api/v4/live/
// brand/{brandId}/event/{lang} (trailing eventId dropped from the single-
// event path) — GUESSED, never confirmed, and wrong on both counts: manual
// inspection of demo.betby.com's own real network traffic (a real live
// match, see session.ts's header comment) shows the real live-events LIST
// path is /api/v4/live/brand/{brandId}/{lang}/0 (no "/event/" segment at
// all) on a completely different, dynamically-fronted host — and it
// requires real browser-session auth, which a plain unauthenticated fetch
// never had. That's why this failed closed for every single real match
// regardless of team-name-matching quality: wrong URL, no auth, every
// time. fetchBetbyJson (above) now routes through the Playwright-captured
// session. The exact JSON shape of THIS specific list endpoint's response
// still isn't independently confirmed (the manual capture this was built
// from only exercised the single-event descriptions endpoint) — kept
// tolerant of the same events-map shape the old (wrong-host) code assumed,
// since v4/live namespacing strongly suggests a related shape, with
// diagnostic logging on a genuine miss so the real shape gets confirmed
// the first time this actually runs against production traffic.
export type BetbyLiveEventSummary = {
  betbyEventId: string;
  sportId: string;
  homeName: string;
  awayName: string;
  tournamentName?: string;
};

const BETBY_LIVE_EVENTS_CACHE_TTL_MS = 15_000;
let betbyLiveEventsCache: BetbyLiveEventSummary[] = [];
let betbyLiveEventsCachedAt = 0;

export function extractLiveEventsList(body: unknown): BetbyLiveEventSummary[] {
  const out: BetbyLiveEventSummary[] = [];
  if (!body || typeof body !== "object") return out;
  const o = body as Record<string, unknown>;
  // Shape A: events as a map keyed by id (what the old, wrong-host code
  // assumed for the single-event path — plausible for the list too).
  const eventsMap = o["events"];
  const tournaments = (o["tournaments"] ?? {}) as Record<string, Record<string, unknown>>;
  if (eventsMap && typeof eventsMap === "object" && !Array.isArray(eventsMap)) {
    for (const [id, ev] of Object.entries(eventsMap as Record<string, unknown>)) {
      const teams = extractTeamNames(ev);
      if (!teams) continue;
      const desc = ((ev as Record<string, unknown>)?.["desc"] ?? ev) as Record<string, unknown>;
      out.push({
        betbyEventId: id,
        sportId: String(desc["sport"] ?? ""),
        homeName: teams.home,
        awayName: teams.away,
        tournamentName: tournaments?.[String(desc["tournament"] ?? "")]?.["name"] as string | undefined,
      });
    }
    if (out.length > 0) return out;
  }
  // Shape B: a bare array of event objects, each carrying its own id.
  if (Array.isArray(eventsMap ?? o)) {
    const arr = (Array.isArray(eventsMap) ? eventsMap : o) as unknown[];
    for (const ev of arr) {
      const teams = extractTeamNames(ev);
      if (!teams) continue;
      const desc = ((ev as Record<string, unknown>)?.["desc"] ?? ev) as Record<string, unknown>;
      const id = firstDefinedString(desc["id"], desc["eventId"], desc["event_id"]);
      if (!id) continue;
      out.push({
        betbyEventId: id,
        sportId: String(desc["sport"] ?? ""),
        homeName: teams.home,
        awayName: teams.away,
        tournamentName: undefined,
      });
    }
  }
  return out;
}

function firstDefinedString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

export async function listBetbyLiveEvents(timeoutMs = 6000): Promise<BetbyLiveEventSummary[]> {
  const now = Date.now();
  if (now - betbyLiveEventsCachedAt < BETBY_LIVE_EVENTS_CACHE_TTL_MS) {
    return betbyLiveEventsCache;
  }
  const path = `/api/v4/live/brand/${BETBY_BRAND_ID}/${BETBY_LANG}/0`;
  const body = await fetchBetbyJson(path, timeoutMs);
  betbyLiveEventsCachedAt = now;
  if (body == null) {
    // Genuine failure (network/auth) — keep serving the last good list
    // rather than wiping it to empty on a transient blip.
    return betbyLiveEventsCache;
  }
  const out = extractLiveEventsList(body);
  if (out.length === 0) recordUnknownBetbyShape("live-events-list", body);
  betbyLiveEventsCache = out;
  return out;
}

/** Inverse of BETBY_SPORT_ID_TO_PULSE_SPORT: the primary BetBY numeric
 *  sportId for a given Bet62/PulseScore sport key. Falls back to "1"
 *  (football) only when the sport has no known BetBY id at all — every
 *  real call site passes a sport this map does cover. */
export function betbySportIdForPulseSport(pulseSport: string): string {
  for (const [betbyId, sport] of Object.entries(BETBY_SPORT_ID_TO_PULSE_SPORT)) {
    if (sport === pulseSport) return betbyId;
  }
  return "1";
}

/** Finds the best-matching currently-live BetBY event for a Bet62 match,
 *  by team name (both home AND away must match, either order — a single
 *  team name coincidentally matching an unrelated match is exactly the
 *  false-positive class this session already had to harden the
 *  API-Football fixture matcher against) constrained to the same sport
 *  family. Returns null rather than a weak guess when nothing qualifies. */
export function findBetbyLiveEventByTeams(
  home: string,
  away: string,
  pulseSport: string,
  events: BetbyLiveEventSummary[],
): BetbyLiveEventSummary | null {
  if (!home || !away) return null;
  const wantedSportIds = new Set(
    Object.entries(BETBY_SPORT_ID_TO_PULSE_SPORT)
      .filter(([, s]) => s === pulseSport)
      .map(([id]) => id),
  );
  for (const ev of events) {
    if (wantedSportIds.size > 0 && !wantedSportIds.has(ev.sportId)) continue;
    const direct = teamNamesMatch(ev.homeName, home) && teamNamesMatch(ev.awayName, away);
    const swapped = teamNamesMatch(ev.awayName, home) && teamNamesMatch(ev.homeName, away);
    if (direct || swapped) return ev;
  }
  return null;
}

function scoreFromPulseEvent(ev: PulseScoreEvent | null | undefined): { home: string; away: string } | null {
  if (!ev?.score) return null;
  return { home: String(ev.score.home ?? "0"), away: String(ev.score.away ?? "0") };
}

function minuteFromPulseEvent(ev: PulseScoreEvent | null | undefined): number | null {
  if (!ev) return null;
  if (ev.matchClock && typeof ev.matchClock.minute === "number") return ev.matchClock.minute;
  const tm = ev.moreInfo?.TM;
  if (typeof tm === "string" && /^\d+$/.test(tm)) {
    const n = parseInt(tm, 10);
    if (n >= 0 && n <= 150) return n;
  }
  return null;
}

function periodFromPulseEvent(ev: PulseScoreEvent | null | undefined): string | null {
  if (!ev) return null;
  if (ev.matchClock?.period) return String(ev.matchClock.period);
  return null;
}

function runningFromPulseEvent(ev: PulseScoreEvent | null | undefined): boolean | null {
  if (!ev) return null;
  if (typeof ev.matchClock?.running === "boolean") return ev.matchClock.running;
  return null;
}

export function matchBetbyEventToPulseScore(
  meta: BetbyMatchMeta | null,
  opts?: {
    candidatePulseEventId?: string;
    maxAgeWsMs?: number;
  },
): PulseMatchSnapshot {
  const now = Date.now();
  const maxAge = opts?.maxAgeWsMs ?? 12_000;
  const empty: PulseMatchSnapshot = {
    source: "pulsescore",
    pulseEventId: null,
    matchedBy: "none",
    confidence: 0,
    home: meta?.homeName ?? "",
    away: meta?.awayName ?? "",
    score: null,
    minute: null,
    period: null,
    running: null,
    updatedAtMs: now,
    live: false,
  };
  if (!meta) return empty;
  const getter = BETBY_SPORT_ID_TO_WS_GETTERS[meta.sportId];
  if (!getter) return empty;

  if (opts?.candidatePulseEventId) {
    const ev = getter.fresh(opts.candidatePulseEventId, maxAge);
    if (ev && (!meta.sportId || ev.sport === getter.pulseSport)) {
      const homeGood = teamNamesMatch(ev.home, meta.homeName);
      const awayGood = teamNamesMatch(ev.away, meta.awayName);
      if (homeGood || awayGood) {
        return {
          source: "pulsescore",
          pulseEventId: ev.eventId,
          matchedBy: homeGood && awayGood ? "sport+home+away" : homeGood ? "sport+home" : "sport+away",
          confidence: homeGood && awayGood ? 3 : 1,
          home: ev.home,
          away: ev.away,
          score: scoreFromPulseEvent(ev),
          minute: minuteFromPulseEvent(ev),
          period: periodFromPulseEvent(ev),
          running: runningFromPulseEvent(ev),
          updatedAtMs: now,
          live: true,
        };
      }
    }
  }

  const all: PulseScoreEvent[] = getter.all();
  let best = null as null | { ev: PulseScoreEvent; score: number; kind: PulseMatchSnapshot["matchedBy"] };
  for (const ev of all) {
    if (!ev || ev.sport !== getter.pulseSport) continue;
    const h = teamNamesMatch(ev.home, meta.homeName);
    const a = teamNamesMatch(ev.away, meta.awayName);
    if (!h && !a) continue;
    let kind: PulseMatchSnapshot["matchedBy"] = "none";
    let s = 0;
    if (h && a) { kind = "sport+home+away"; s = 100; }
    else if (h) { kind = "sport+home"; s = 50; }
    else { kind = "sport+away"; s = 45; }
    if (!best || best.score < s) best = { ev, score: s, kind };
    if (s >= 100) break;
  }
  if (!best) return empty;
  const conf: PulseMatchSnapshot["confidence"] =
    best.kind === "sport+home+away" ? 3 : best.kind === "sport+home" ? 1 : 1;
  return {
    source: "pulsescore",
    pulseEventId: best.ev.eventId,
    matchedBy: best.kind,
    confidence: conf,
    home: best.ev.home,
    away: best.ev.away,
    score: scoreFromPulseEvent(best.ev),
    minute: minuteFromPulseEvent(best.ev),
    period: periodFromPulseEvent(best.ev),
    running: runningFromPulseEvent(best.ev),
    updatedAtMs: now,
    live: true,
  };
}

export type SsePulseMessage =
  | { type: "meta"; meta: BetbyMatchMeta }
  | { type: "match"; match: PulseMatchSnapshot }
  | { type: "ping"; ts: number }
  | { type: "error"; message: string };

export function stringifySse(evt: SsePulseMessage): string {
  const dataLine = JSON.stringify(evt);
  const typeField =
    evt.type === "match" ? "match" :
    evt.type === "meta" ? "meta" :
    evt.type === "error" ? "error" :
    "ping";
  return `event: ${typeField}\ndata: ${dataLine}\n\n`;
}
