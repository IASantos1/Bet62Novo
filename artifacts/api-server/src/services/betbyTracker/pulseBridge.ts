import { teamNamesMatch } from "../pulsescore/teamMatch.js";
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
};

export async function resolveBetbyMatchMeta(
  betbyEventId: string,
  timeoutMs = 5500,
): Promise<BetbyMatchMeta | null> {
  const BETBY_BRAND_ID_LIVE = process.env.BETBY_BRAND_ID || "1653815133341880320";
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://${process.env.BETBY_API_HOST ?? "demoapi.betby.com"}/api/v4/live/brand/${BETBY_BRAND_ID_LIVE}/event/${process.env.BETBY_LANG_DEFAULT ?? "en"}/${betbyEventId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(to);
    if (!res.ok) return null;
    const json: any = await res.json();
    const sports: any = json?.sports ?? {};
    const categories: any = json?.categories ?? {};
    const tournaments: any = json?.tournaments ?? {};
    const events: any = json?.events ?? {};
    const ev: any = events?.[betbyEventId];
    if (!ev?.desc) return null;
    const home = ev.desc.competitors?.[0]?.name ?? "";
    const away = ev.desc.competitors?.[1]?.name ?? "";
    if (!home || !away) return null;
    const sportId = String(ev.desc.sport ?? "1");
    return {
      betbyEventId,
      sportId,
      sportName: sports?.[sportId]?.name ?? undefined,
      homeName: home,
      awayName: away,
      tournamentName: tournaments?.[String(ev.desc.tournament ?? "")]?.name ?? undefined,
      leagueName: categories?.[String(ev.desc.category ?? "")]?.name ?? undefined,
    };
  } catch (err) {
    logger.warn(
      { err, betbyEventId },
      "[pulseBridge] resolveBetbyMatchMeta: failed to resolve BetBY match metadata",
    );
    return null;
  } finally {
    clearTimeout(to);
  }
}

// ─── Auto-discovery: PulseScore ↔ BetBY live-event matching, any sport ────
// User request 2026-08-13: the Tracker should work for ANY match that goes
// live, any sport, without needing an admin to hand-map every fixture in
// live_stream_mappings first. resolveBetbyMatchMeta above already proved
// this exact REST shape works for a SINGLE known event id — its response
// carries `events` as a MAP (not a single object) alongside brand-wide
// `sports`/`categories`/`tournaments` dictionaries, which is the shape of a
// "live centre" snapshot, not a single-record lookup. listBetbyLiveEvents
// calls the same path with the trailing eventId segment dropped — the
// standard REST "collection vs. resource" convention — to read that same
// map as a genuine live catalogue across every sport BetBY's demo brand
// currently has live, instead of needing an id in hand first. This has not
// been verified against BetBY's live production traffic (no outbound
// network access to demoapi.betby.com from where this was written) — if
// the collection path 404s or shape differs, this fails closed (empty
// list, one clear warning log) and callers fall back to the existing
// admin-managed live_stream_mappings table exactly as before, so it can't
// make Tracker resolution worse than it already was.
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

export async function listBetbyLiveEvents(timeoutMs = 6000): Promise<BetbyLiveEventSummary[]> {
  const now = Date.now();
  if (now - betbyLiveEventsCachedAt < BETBY_LIVE_EVENTS_CACHE_TTL_MS) {
    return betbyLiveEventsCache;
  }
  const BETBY_BRAND_ID_LIVE = process.env.BETBY_BRAND_ID || "1653815133341880320";
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://${process.env.BETBY_API_HOST ?? "demoapi.betby.com"}/api/v4/live/brand/${BETBY_BRAND_ID_LIVE}/event/${process.env.BETBY_LANG_DEFAULT ?? "en"}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, url },
        "[pulseBridge] listBetbyLiveEvents: collection endpoint returned non-OK — falling back to cached/empty list",
      );
      betbyLiveEventsCache = [];
      betbyLiveEventsCachedAt = now;
      return betbyLiveEventsCache;
    }
    const json: any = await res.json();
    const events: any = json?.events ?? {};
    const tournaments: any = json?.tournaments ?? {};
    const out: BetbyLiveEventSummary[] = [];
    for (const [id, ev] of Object.entries<any>(events)) {
      const home = ev?.desc?.competitors?.[0]?.name;
      const away = ev?.desc?.competitors?.[1]?.name;
      if (!home || !away) continue;
      out.push({
        betbyEventId: id,
        sportId: String(ev?.desc?.sport ?? ""),
        homeName: String(home),
        awayName: String(away),
        tournamentName: tournaments?.[String(ev?.desc?.tournament ?? "")]?.name ?? undefined,
      });
    }
    betbyLiveEventsCache = out;
    betbyLiveEventsCachedAt = now;
    return out;
  } catch (err) {
    logger.warn({ err }, "[pulseBridge] listBetbyLiveEvents failed");
    return betbyLiveEventsCache;
  } finally {
    clearTimeout(to);
  }
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
