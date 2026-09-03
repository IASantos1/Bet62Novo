// Generic REST-polled PulseScore live source, ORIGINALLY built to cover
// every sport beyond football/tennis. Since then, basketball and volleyball
// each got their own dedicated module (basketball.ts, volleyball.ts — see
// those files' own header comments) that fully supersedes what's exported
// here for them; hockey's own prematch source is hockey.ts, not this file
// either. This file's `pulseScoreBasketball`/`pulseScoreVolleyball` exports
// below are therefore only live consumers for admin.ts's read-only
// /pulsescore-debug diagnostic route, deliberately kept on their own
// bookmaker (basketball → fanduel, volleyball → paddypower) as an
// independent cross-check against a DIFFERENT bookmaker than the real
// pipeline uses — not a description of what's actually live for those two.
//
// Hockey and baseball are different: `pulseScoreHockey.getLive()` is the
// real live source wired into matches.ts's buildHockeyLiveFromPulseScore,
// and `pulseScoreBaseball` is baseball's only PulseScore code at all
// (matches.ts's live builder and findOverride odds lookup both use it) —
// for those two sports this file IS the product pipeline, not a diagnostic,
// so their bookmaker below was moved to onexbet alongside every other
// non-football sport (2026-08-27), not left on the old bookmaker.
//
// Each sport here is deliberately assigned a *different* bookmaker prefix
// rather than piling onto bet365 alongside football. The PRO plan's REST
// rate limit is documented per bookmaker ("Cotação (por casa de apostas):
// 1 requisição/seg"), not per sport — if every sport polled bet365 at 1s
// intervals, they'd all be fighting over the same 1 req/s budget and none
// would actually get 1s freshness. One API key works across every
// bookmaker prefix (the docs advertise this explicitly: "o mesmo
// esquema... independentemente de usar bookmaker, bookmaker2"), so
// spreading sports across bookmakers gives each its own independent budget
// under a single PRO subscription.
//
// Only the moneyline (match_winner) is mapped, same conservative approach
// as tennis — the docs don't give a per-sport example of total-points/
// total-goals-equivalent canonicalMarket names, so guessing them risks
// silently mis-mapping odds. Unknown markets are logged once instead, so
// the mapping can grow from what each sport's real traffic actually sends.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import {
  pulseScoreGet,
  type PulseScoreEvent,
  type PulseScoreLiveEventsResponse,
} from "./client.js";
import { teamNamesMatch } from "./teamMatch.js";

export type GenericMoneylineOverride = {
  odds?: { home: number; draw?: number; away: number };
  // Total / Double Chance / odd-even — settlement.ts already grades these
  // generically for any sport off the plain final score (ft.home+ft.away
  // for total/odd-even, home/away/draw comparison for double chance — see
  // scoreOutcomeForSel), and for hockey/baseball specifically `ft` genuinely
  // IS the stat these markets are about (goals/runs), unlike tennis/
  // volleyball where the "final score" is sets won — so no new settlement
  // code needed and no sets-vs-points mismatch risk here. Confirmed real
  // (2026-08-27, onexbet /live-events samples for both sports this module
  // actually feeds live: hockey and baseball — see this file's header).
  // Handicap/spread is deliberately NOT added here even though it's
  // available on both sports' real feeds — see genericSportLive's header on
  // hockey/baseball being the "product pipeline" for exactly this reason:
  // the sign-convention bug already found and fixed in basketball's
  // b-spread- and baseball's rl-home/away keys makes wiring a new handicap
  // source risky without picking a specific, already-verified settlement
  // key per sport, not a shared one.
  total?: { line: number; over: number; under: number };
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  oddEven?: { odd: number; even: number };
};

function oddsToNumber(raw: number | undefined): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 1.0 ? raw : null;
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
    // Response is a paginated wrapper ({ total, page, ..., events: [...] }),
    // not a bare array — confirmed against a real bet365 call and
    // documented by PulseScore as the same shape for every bookmaker. Lets
    // errors propagate — see getLive's .catch() below for why swallowing
    // them here (the previous behavior) was a real bug: a transient 429/
    // timeout silently wiped this sport's live feed to empty, the exact
    // pattern already fixed in football.ts/tennis.ts/basketball.ts/
    // volleyball.ts's own live pollers (audit finding, 2026-08-10 — this
    // module hadn't gotten the same fix). Currently dormant (only feeds
    // the admin usage endpoint, not wired into any live builder yet), but
    // a live landmine for whenever it is.
    const data = await pulseScoreGet<PulseScoreLiveEventsResponse>(
      `/live-events?sport=${encodeURIComponent(opts.sport)}&limit=200`,
      4_000,
      opts.bookmaker,
    );
    return Array.isArray(data?.events) ? data.events : [];
  }

  /** Live odds from PulseScore for this sport. Empty array if
   * PULSESCORE_API_KEY isn't configured, or the upstream call fails on the
   * very first attempt (nothing cached yet to fall back to). */
  async function getLive(): Promise<PulseScoreEvent[]> {
    if (!CONFIG.ENABLE_PULSESCORE) return [];
    if (!CONFIG.PULSESCORE_API_KEY) return [];
    const now = Date.now();
    if (cache && now - cache.fetchedAt < ttlMs) return cache.events;
    if (!inFlight) {
      inFlight = fetchLive()
        .then((events) => {
          cache = { events, fetchedAt: Date.now() };
          return events;
        })
        .catch((err) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), sport: opts.label },
            "[pulsescore] generic live fetch failed — serving stale cache",
          );
          return cache?.events ?? [];
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
    // "match_winner" was never observed in a real call (verified against
    // bet365/football, 2026-08-05) — real data used canonicalMarket
    // "MATCH_RESULT" or "OTHER" with rawName "Fulltime Result" instead. Not
    // verified per-sport/per-bookmaker here, so match on FULL_TIME period +
    // MATCH_RESULT first, falling back to the original assumption in case
    // some bookmaker/sport combination genuinely does send "match_winner".
    const isFulltime = (period: string) => (period || "").toUpperCase() === "FULL_TIME";
    const matchWinnerMarkets = (ev.markets ?? []).filter(
      (m) =>
        isFulltime(m.period) &&
        (m.canonicalMarket === "MATCH_RESULT" || m.canonicalMarket === "match_winner"),
    );
    for (const m of ev.markets ?? []) {
      if (matchWinnerMarkets.includes(m)) continue;
      if (!seenUnknownMarkets.has(m.canonicalMarket)) {
        seenUnknownMarkets.add(m.canonicalMarket);
        logger.info(
          { sport: opts.label, canonicalMarket: m.canonicalMarket, rawName: m.rawName },
          "[pulsescore] unmapped canonicalMarket seen — candidate to add to the override mapping",
        );
      }
    }
    // If more than one match_winner-shaped market shows up (e.g. per-period
    // odds alongside the overall match), skip rather than risk mixing them up.
    if (matchWinnerMarkets.length !== 1) return {};
    const market = matchWinnerMarkets[0]!;
    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const sel of market.selections ?? []) {
      if (!sel.isActive) continue;
      const val = oddsToNumber(sel.odds);
      if (val === null) continue;
      if (sel.canonicalOutcome === "HOME") home = val;
      else if (sel.canonicalOutcome === "AWAY") away = val;
      else if (sel.canonicalOutcome === "DRAW") draw = val;
      else if (teamNamesMatch(sel.rawName, ev.home)) home = val;
      else if (teamNamesMatch(sel.rawName, ev.away)) away = val;
    }
    const out: GenericMoneylineOverride =
      home !== null && away !== null
        ? { odds: draw !== null ? { home, draw, away } : { home, away } }
        : {};

    const totalMarkets = (ev.markets ?? []).filter(
      (m) => m.canonicalMarket === "OVER_UNDER" && isFulltime(m.period),
    );
    if (totalMarkets.length === 1) {
      let over: number | null = null;
      let under: number | null = null;
      let line: number | null = null;
      for (const sel of totalMarkets[0]!.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "OVER") {
          over = val;
          line = sel.line ?? totalMarkets[0]!.line ?? null;
        } else if (sel.canonicalOutcome === "UNDER") {
          under = val;
        }
      }
      if (over !== null && under !== null && line !== null) out.total = { line, over, under };
    }

    const doubleChanceMarkets = (ev.markets ?? []).filter(
      (m) => m.canonicalMarket === "DOUBLE_CHANCE" && isFulltime(m.period),
    );
    if (doubleChanceMarkets.length === 1) {
      let hd: number | null = null;
      let da: number | null = null;
      let ha: number | null = null;
      for (const sel of doubleChanceMarkets[0]!.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "HOME_DRAW") hd = val;
        else if (sel.canonicalOutcome === "DRAW_AWAY") da = val;
        else if (sel.canonicalOutcome === "HOME_AWAY") ha = val;
      }
      if (hd !== null && da !== null && ha !== null) {
        out.doubleChance = { homeOrDraw: hd, awayOrDraw: da, homeOrAway: ha };
      }
    }

    const oddEvenMarkets = (ev.markets ?? []).filter(
      (m) => m.canonicalMarket === "TOTAL_GOALS_ODD_EVEN" && isFulltime(m.period),
    );
    if (oddEvenMarkets.length === 1) {
      let odd: number | null = null;
      let even: number | null = null;
      for (const sel of oddEvenMarkets[0]!.selections ?? []) {
        if (!sel.isActive) continue;
        const val = oddsToNumber(sel.odds);
        if (val === null) continue;
        if (sel.canonicalOutcome === "ODD") odd = val;
        else if (sel.canonicalOutcome === "EVEN") even = val;
      }
      if (odd !== null && even !== null) out.oddEven = { odd, even };
    }

    return out;
  }

  /** Finds the matching PulseScore event by team name and returns its
   * market override, if any. `events` should be one already-fetched
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
    // Was `override.odds ? override : null` — missed real total/
    // doubleChance/oddEven data on the rare event with no moneyline read.
    // Return null only when NOTHING was extracted, not just when odds
    // specifically is missing.
    const hasAnything =
      override.odds || override.total || override.doubleChance || override.oddEven;
    return hasAnything ? override : null;
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
  bookmaker: "onexbet",
  label: "hockey",
});
export const pulseScoreBaseball = createPulseScoreRestSport({
  sport: "baseball",
  bookmaker: "onexbet",
  label: "baseball",
});
export const pulseScoreVolleyball = createPulseScoreRestSport({
  sport: "volleyball",
  bookmaker: "paddypower",
  label: "volleyball",
});
