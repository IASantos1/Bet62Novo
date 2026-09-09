// Shared, sport-agnostic PropLine extraction helpers — basketball, hockey,
// volleyball, and mma all build on the same real /odds and /scores shapes
// (see index.ts's ProplineEvent/ProplineScore/ProplineBookmaker types), so
// this factors the common extraction logic out instead of each sport
// module re-duplicating it.
import type { ProplineBookmaker, ProplineScore } from "./index.js";

/** Preference/positional-fallback H2H (moneyline) extraction validated
 * against real PropLine responses earlier this session: tries a curated
 * bookmaker order first, matches outcomes by team name, and falls back to
 * outcome POSITION only when PropLine's own documented ordering guarantee
 * applies (home, away, then draw when threeWay) and the count matches
 * exactly. Returns null (never a fabricated price) when no h2h market is
 * found for any bookmaker. Odds are requested in decimal format
 * (oddsFormat: "decimal") by the callers below, so no American→decimal
 * conversion is needed here. */
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
    return { home: homePrice, draw: threeWay && drawPrice != null ? drawPrice : 0, away: awayPrice };
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
