// Shared, sport-agnostic PropLine extraction helpers — basketball, hockey,
// volleyball, and mma all build on the same real /odds and /scores shapes
// (see index.ts's ProplineEvent/ProplineScore/ProplineBookmaker types), so
// this factors the common extraction logic out instead of each sport
// module re-duplicating it.
import type { ProplineBookmaker, ProplineScore } from "./index.js";
import { normalizeTeamName, isFuzzyMatch } from "./football.js";

/** PropLine's `oddsFormat: "decimal"` request param isn't honored for every
 * sport/market — basketball/hockey/volleyball/mma responses observed in
 * production 2026-09-09 came back as raw American prices (e.g. -7000, 1100)
 * despite the request, producing wildly wrong "decimal" odds once displayed
 * as-is. American odds are never in the [-99, 99] range by definition, so
 * any price outside that band is converted; anything already inside it is
 * assumed to already be a real decimal price and passed through untouched. */
function proplineNormalizeOddsPrice(price: number): number {
  if (!Number.isFinite(price)) return price;
  if (price <= -100) return Math.round((1 + 100 / Math.abs(price)) * 100) / 100;
  if (price >= 100) return Math.round((1 + price / 100) * 100) / 100;
  return price;
}

/** Preference/positional-fallback H2H (moneyline) extraction validated
 * against real PropLine responses earlier this session: tries a curated
 * bookmaker order first, matches outcomes by team name, and falls back to
 * outcome POSITION only when PropLine's own documented ordering guarantee
 * applies (home, away, then draw when threeWay) and the count matches
 * exactly. Returns null (never a fabricated price) when no h2h market is
 * found for any bookmaker. Every price is run through
 * proplineNormalizeOddsPrice before being returned (see its own comment —
 * requesting oddsFormat: "decimal" doesn't guarantee a decimal response). */
export function extractProplineH2HOdds(
  bookmakers: ProplineBookmaker[] | null | undefined,
  home: string,
  away: string,
  threeWay: boolean,
): { home: number; draw: number; away: number } | null {
  if (!bookmakers || bookmakers.length === 0) return null;
  const preferredOrder = ["pinnacle", "bovada", "betmgm", "kalshi", "betonlineag", "lowvig", "draftkings", "fanduel"];
  const ordered = [...bookmakers].sort((a, b) => {
    const ai = preferredOrder.indexOf(a.key);
    const bi = preferredOrder.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const bm of ordered) {
    const market = bm.markets.find((m) => m.key === "h2h");
    if (!market) continue;
    let homePrice: number | null = null;
    let awayPrice: number | null = null;
    let drawPrice: number | null = null;
    for (const o of market.outcomes) {
      const name = (o.name || "").toLowerCase();
      if (name === "draw") drawPrice = o.price;
      else if (name === home.toLowerCase() || o.name === home) homePrice = o.price;
      else if (name === away.toLowerCase() || o.name === away) awayPrice = o.price;
    }
    const expectedCount = threeWay ? 3 : 2;
    if (
      (homePrice == null || awayPrice == null || (threeWay && drawPrice == null)) &&
      market.outcomes.length === expectedCount
    ) {
      const [h, a, d] = market.outcomes;
      if (h && a) {
        homePrice ??= h.price;
        awayPrice ??= a.price;
        if (threeWay && d) drawPrice ??= d.price;
      }
    }
    if (homePrice == null || awayPrice == null) continue;
    if (threeWay && drawPrice == null) continue;
    return {
      home: proplineNormalizeOddsPrice(homePrice),
      draw: threeWay && drawPrice != null ? proplineNormalizeOddsPrice(drawPrice) : 0,
      away: proplineNormalizeOddsPrice(awayPrice),
    };
  }
  return null;
}

/** Extracts {home, away, status} from a ProplineScore entry defensively —
 * the real /scores payload shape wasn't re-confirmed against a live sample
 * for this restoration (no API key available in this environment), so this
 * accepts either the explicit home_score/away_score/status/period fields
 * confirmed real in this session's earlier PropLine work, or the generic
 * `scores: [{name, score}]` pairing the-odds-api-style APIs also use —
 * matched back to home/away by team name. Returns null (never a fabricated
 * 0-0) when neither shape yields a usable pair. */
export function extractProplineScore(
  ev: ProplineScore & {
    home_score?: number | string | null;
    away_score?: number | string | null;
    status?: string | null;
    period?: string | null;
    live?: boolean | null;
  },
): { home: number; away: number; status: string | null } | null {
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const direct = { home: toNum(ev.home_score), away: toNum(ev.away_score) };
  if (direct.home !== null && direct.away !== null) {
    return { home: direct.home, away: direct.away, status: ev.status ?? ev.period ?? null };
  }
  if (Array.isArray(ev.scores) && ev.scores.length >= 2) {
    const homeEntry = ev.scores.find((s) => s.name === ev.home_team);
    const awayEntry = ev.scores.find((s) => s.name === ev.away_team);
    const home = toNum(homeEntry?.score);
    const away = toNum(awayEntry?.score);
    if (home !== null && away !== null) {
      return { home, away, status: ev.completed ? "final" : null };
    }
  }
  return null;
}

/** ISO-datetime → { date: "DD.MM.YYYY", time: "HH:MM" } in Europe/Lisbon —
 * same helper this file has always used for every ISO-timestamp-based
 * provider (PulseScore, SportMonks); PropLine's commence_time is also a
 * real ISO string. */
export function proplineEventDateTime(startTime: string): { date: string; time: string } {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const hh = p["hour"] === "24" ? "00" : (p["hour"] ?? "00");
  const mm = p["minute"] ?? "00";
  return {
    date: `${p["day"] ?? "01"}.${p["month"] ?? "01"}.${p["year"] ?? "2025"}`,
    time: `${hh}:${mm}`,
  };
}

/** PropLine sometimes lists the exact same real-world fixture as two
 * separate events when a bookmaker/region reports a team's name in a
 * different language — confirmed in production 2026-09-09 with a
 * volleyball "Turkiye vs Alemanha" and "Turquia vs Alemanha" pair at the
 * same kickoff time and nearly identical odds. normalizeTeamName's
 * accent/case folding can't unify genuinely different-language spellings
 * of the same country, so this dedupes by exact kickoff date+time plus a
 * fuzzy match on at least one side's team name (checked both straight and
 * crossed, in case one language pairs differently) — keeping whichever
 * duplicate carries real bookmaker odds when only one of them does. */
export function dedupeProplineFixtures<
  T extends { date: string; time: string; home: string; away: string; hasRealOdds?: boolean },
>(matches: T[]): T[] {
  const kept: T[] = [];
  for (const m of matches) {
    const mHome = normalizeTeamName(m.home);
    const mAway = normalizeTeamName(m.away);
    const dupIndex = kept.findIndex((k) => {
      if (k.date !== m.date || k.time !== m.time) return false;
      const kHome = normalizeTeamName(k.home);
      const kAway = normalizeTeamName(k.away);
      return (
        isFuzzyMatch(kHome, mHome, 0.22) ||
        isFuzzyMatch(kAway, mAway, 0.22) ||
        isFuzzyMatch(kHome, mAway, 0.22) ||
        isFuzzyMatch(kAway, mHome, 0.22)
      );
    });
    if (dupIndex === -1) {
      kept.push(m);
      continue;
    }
    if (!kept[dupIndex].hasRealOdds && m.hasRealOdds) {
      kept[dupIndex] = m;
    }
  }
  return kept;
}
