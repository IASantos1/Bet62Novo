// Generic REST-polled PulseScore live source for sports beyond football
// (which has its own module for the total_goals mapping) and tennis (which
// uses the one PRO-plan WebSocket slot instead — see tennisWs.ts).
//
// Each sport here is deliberately assigned a *different* bookmaker prefix
// (basketball → fanduel, ice-hockey → bwin, baseball → draftkings,
// volleyball → paddypower) rather than piling onto bet365 alongside
// football. The PRO plan's REST rate limit is documented per bookmaker
// ("Cotação (por casa de apostas): 1 requisição/seg"), not per sport — if
// every sport polled bet365 at 1s intervals, they'd all be fighting over
// the same 1 req/s budget and none would actually get 1s freshness. One
// API key works across every bookmaker prefix (the docs advertise this
// explicitly: "o mesmo esquema... independentemente de usar bookmaker,
// bookmaker2"), so spreading sports across bookmakers gives each its own
// independent budget under a single PRO subscription.
//
// Only the moneyline (match_winner) is mapped, same conservative approach
// as tennis — the docs don't give a per-sport example of total-points/
// total-goals-equivalent canonicalMarket names, so guessing them risks
// silently mis-mapping odds. Unknown markets are logged once instead, so
// the mapping can grow from what each sport's real traffic actually sends.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { pulseScoreGet, type PulseScoreEvent } from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

export type GenericMoneylineOverride = {
  odds?: { home: number; draw?: number; away: number };
};

function decimalToNumber(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1.0 ? n : null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createPulseScoreRestSport(opts: {
  sport: string; // PulseScore's ?sport= slug, e.g. "basketball"
  bookmaker: string; // distinct bookmaker prefix — its own rate-limit budget
  label: string; // for log messages, e.g. "basketball"
  ttlMs?: number;
}) {
  const ttlMs = opts.ttlMs ?? 1_000;
  let cache: { events: PulseScoreEvent[]; fetchedAt: number } | null = null;
  let inFlight: Promise<PulseScoreEvent[]> | null = null;
  let requestsToday = 0;
  let usageDate = todayUtc();
  const seenUnknownMarkets = new Set<string>();

  function rollUsageDateIfNeeded(): void {
    const d = todayUtc();
    if (d !== usageDate) {
      usageDate = d;
      requestsToday = 0;
    }
  }

  async function fetchLive(): Promise<PulseScoreEvent[]> {
    rollUsageDateIfNeeded();
    requestsToday += 1;
    try {
      const data = await pulseScoreGet<PulseScoreEvent[]>(
        `/live-events?sport=${encodeURIComponent(opts.sport)}`,
        4_000,
        opts.bookmaker,
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** Live odds from PulseScore for this sport. Empty array if
   * PULSESCORE_API_KEY isn't configured or the upstream call fails. */
  async function getLive(): Promise<PulseScoreEvent[]> {
    if (!CONFIG.PULSESCORE_API_KEY) return [];
    const now = Date.now();
    if (cache && now - cache.fetchedAt < ttlMs) return cache.events;
    if (!inFlight) {
      inFlight = fetchLive()
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

  function getUsage(): { requestsToday: number; date: string } {
    rollUsageDateIfNeeded();
    return { requestsToday, date: usageDate };
  }

  function extractOverride(ev: PulseScoreEvent): GenericMoneylineOverride {
    const matchWinnerMarkets = (ev.markets ?? []).filter(
      (m) => m.canonicalMarket === "match_winner",
    );
    for (const m of ev.markets ?? []) {
      if (m.canonicalMarket === "match_winner") continue;
      if (!seenUnknownMarkets.has(m.canonicalMarket)) {
        seenUnknownMarkets.add(m.canonicalMarket);
        logger.info(
          { sport: opts.label, canonicalMarket: m.canonicalMarket },
          "[pulsescore] unmapped canonicalMarket seen — candidate to add to the override mapping",
        );
      }
    }
    // Same caution as tennis: no per-sport example of how `period` is
    // labelled here, so if more than one match_winner market shows up
    // (e.g. per-period odds alongside the overall match), skip rather
    // than risk mixing them up.
    if (matchWinnerMarkets.length !== 1) return {};
    const market = matchWinnerMarkets[0]!;
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const sel of market.selections ?? []) {
      const val = decimalToNumber(sel.decimal);
      if (val === null) continue;
      if (teamNamesMatch(sel.name, ev.home)) home = val;
      else if (teamNamesMatch(sel.name, ev.away)) away = val;
      else draw = val;
    }
    if (home === null || away === null) return {};
    return { odds: draw !== null ? { home, draw, away } : { home, away } };
  }

  /** Finds the matching PulseScore event by team name and returns its
   * moneyline override, if any. `events` should be one already-fetched
   * getLive() batch — never call this per-match. */
  function findOverride(
    home: string,
    away: string,
    events: PulseScoreEvent[],
  ): GenericMoneylineOverride | null {
    const ev = events.find(
      (e) => teamNamesMatch(home, e.home) && teamNamesMatch(away, e.away),
    );
    if (!ev) return null;
    const override = extractOverride(ev);
    return override.odds ? override : null;
  }

  return { getLive, getUsage, findOverride };
}

export const pulseScoreBasketball = createPulseScoreRestSport({
  sport: "basketball",
  bookmaker: "fanduel",
  label: "basketball",
});
export const pulseScoreHockey = createPulseScoreRestSport({
  sport: "ice-hockey",
  bookmaker: "bwin",
  label: "hockey",
});
export const pulseScoreBaseball = createPulseScoreRestSport({
  sport: "baseball",
  bookmaker: "draftkings",
  label: "baseball",
});
export const pulseScoreVolleyball = createPulseScoreRestSport({
  sport: "volleyball",
  bookmaker: "paddypower",
  label: "volleyball",
});
