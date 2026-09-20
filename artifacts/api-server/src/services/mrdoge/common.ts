// Mr. Doge (api.mrdoge.co) — pure mapping/extraction helpers, no I/O. See
// client.ts's header and lib/config.ts's MRDOGE_API_KEY comment for the
// provider's real confirmed scope (6 of BET62's 8 sports; darts/MMA are
// not covered by this provider at all).
import type { Clock, Match, Market, SoccerStats } from "@mrdoge/node";

/** BET62's own sport key -> Mr. Doge's SportName. Only the 6 sports the
 * provider actually supports (confirmed via the real published package's
 * SportName enum, not just doc prose) — darts and MMA have no entry here
 * on purpose, there is no Mr. Doge equivalent to map to. */
export const MRDOGE_SPORT_BY_BET62: Record<string, string> = {
  football: "soccer",
  tennis: "tennis",
  basketball: "basketball",
  hockey: "ice_hockey",
  baseball: "baseball",
  volleyball: "volleyball",
};

export const MRDOGE_ID_PREFIX: Record<string, string> = {
  football: "mrdoge-football-",
  tennis: "mrdoge-tennis-",
  basketball: "mrdoge-basketball-",
  hockey: "mrdoge-hockey-",
  baseball: "mrdoge-baseball-",
  volleyball: "mrdoge-volleyball-",
};

export function mrDogeMatchId(bet62Sport: string, match: Match): string {
  return `${MRDOGE_ID_PREFIX[bet62Sport] ?? `mrdoge-${bet62Sport}-`}${match.id}`;
}

/** Mr. Doge's `match.startTime` is ISO-8601 UTC. BET62's UpcomingMatch/
 * matchStartsInMinutes convention (routes/matches.ts) expects `date`/`time`
 * as Europe/Lisbon LOCAL strings — Intl's own timeZone conversion handles
 * the DST-aware offset AND any date-boundary crossing correctly (unlike the
 * hour-only arithmetic matchStartsInMinutes itself does on the way back,
 * which is pre-existing behavior this doesn't need to replicate). */
export function mrDogeStartTimeToLisbon(startTimeIso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(startTimeIso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Soccer clock -> BET62's status/phase strings (routes/matches.ts checks
 * literal "HT"/"2nd half"/"ET" in several places; _liveExtra.phase is a
 * separate "1H"|"2H"|"HT"|"FT"|"ET"|"PEN" badge hint). `clock.phase` is Mr.
 * Doge's own confirmed-real machine string (its docs' own example is
 * "SOCCER_MATCH_SECOND_HALF") — matched by substring, never guessed. */
export function mrDogeSoccerStatus(clock: Clock | null | undefined): {
  status: string;
  phase: "1H" | "2H" | "HT" | "FT" | "ET" | "PEN";
} {
  const phaseRaw = clock?.phase ?? "";
  if (clock?.state === "finished" || phaseRaw.includes("FINISHED") || phaseRaw.includes("FULL_TIME")) {
    return { status: "FT", phase: "FT" };
  }
  if (clock?.state === "intermission" || phaseRaw.includes("HALF_TIME")) {
    return { status: "HT", phase: "HT" };
  }
  if (phaseRaw.includes("PENALT")) return { status: "PEN", phase: "PEN" };
  if (phaseRaw.includes("EXTRA")) return { status: "ET", phase: "ET" };
  if (phaseRaw.includes("SECOND_HALF")) return { status: "2nd half", phase: "2H" };
  if (phaseRaw.includes("FIRST_HALF")) return { status: "1st half", phase: "1H" };
  return { status: "1st half", phase: "1H" };
}

/** Maps the fixed 0.5-6.5 total-goals lines onto AdvancedMarkets.totalGoals'
 * own over/underNN field names — pure key translation, values come straight
 * from extractMrDogeSoccerTotalGoals, never fabricated. */
export function totalGoalsMapToFields(
  byLine: Map<number, { over: number; under: number }>,
): Partial<Record<string, number>> {
  const suffixByLine: Record<string, string> = {
    "0.5": "05", "1.5": "15", "2.5": "25", "3.5": "35", "4.5": "45", "5.5": "55", "6.5": "65",
  };
  const out: Partial<Record<string, number>> = {};
  for (const [line, prices] of byLine) {
    const suffix = suffixByLine[String(line)];
    if (!suffix) continue;
    out[`over${suffix}`] = prices.over;
    out[`under${suffix}`] = prices.under;
  }
  return out;
}

/** Real per-market extraction — ONLY the 3 betType sysnames confirmed real
 * in Mr. Doge's own docs (SOCCER_MATCH_RESULT[_PRELIVE], SOCCER_UNDER_OVER,
 * SOCCER_BOTH_TEAMS_TO_SCORE). `betType` is an open string at the protocol
 * level (no enum to enumerate from) — every other market needs a real API
 * probe (Fase 0) before being wired in here, never a guessed sysname. */
export function extractMrDogeSoccerMoneyline(
  markets: Market[] | undefined,
): { home: number; draw: number; away: number } | null {
  if (!markets) return null;
  const market = markets.find(
    (m) => m.betType === "SOCCER_MATCH_RESULT" || m.betType === "SOCCER_MATCH_RESULT_PRELIVE",
  );
  if (!market) return null;
  const home = market.lines.find((l) => l.code === "1" && l.isAvailable)?.price;
  const draw = market.lines.find((l) => l.code === "X" && l.isAvailable)?.price;
  const away = market.lines.find((l) => l.code === "2" && l.isAvailable)?.price;
  if (!home || !draw || !away) return null;
  return { home, draw, away };
}

/** BET62's totalGoals slots are fixed lines (0.5/1.5/.../6.5) — this
 * extracts whichever of those lines Mr. Doge actually prices this tick
 * from SOCCER_UNDER_OVER (any other line, or a line the book hasn't
 * priced, is simply absent from the returned map, never fabricated). */
export function extractMrDogeSoccerTotalGoals(
  markets: Market[] | undefined,
): Map<number, { over: number; under: number }> {
  const result = new Map<number, { over: number; under: number }>();
  if (!markets) return result;
  const byLine = new Map<number, { over?: number; under?: number }>();
  for (const market of markets) {
    if (market.betType !== "SOCCER_UNDER_OVER") continue;
    for (const line of market.lines) {
      if (!line.isAvailable) continue;
      const m = /^([OU])(\d+(?:\.\d+)?)$/.exec(line.code);
      if (!m) continue;
      const value = Number(m[2]);
      if (!Number.isFinite(value)) continue;
      const entry = byLine.get(value) ?? {};
      if (m[1] === "O") entry.over = line.price;
      else entry.under = line.price;
      byLine.set(value, entry);
    }
  }
  for (const [value, entry] of byLine) {
    if (entry.over != null && entry.under != null) {
      result.set(value, { over: entry.over, under: entry.under });
    }
  }
  return result;
}

/** BTTS ("GG"/"Ambas Marcam") — the "yes" code is confirmed real in the
 * docs ("GG"); the "no" side's exact code isn't documented anywhere, so
 * rather than guess a spelling ("NG"/"No"/"N"), this takes whichever OTHER
 * line shares the market with the confirmed "GG" line — correct for any
 * two-outcome market regardless of how the negative side is spelled. */
export function extractMrDogeSoccerBtts(
  markets: Market[] | undefined,
): { yes: number; no: number } | null {
  if (!markets) return null;
  const market = markets.find((m) => m.betType === "SOCCER_BOTH_TEAMS_TO_SCORE");
  if (!market) return null;
  const yesLine = market.lines.find((l) => l.code === "GG" && l.isAvailable);
  const noLine = market.lines.find((l) => l.code !== "GG" && l.isAvailable);
  if (!yesLine || !noLine) return null;
  return { yes: yesLine.price, no: noLine.price };
}

/** Real per-team football stats this tick, straight off Mr. Doge's
 * SoccerStats — never fabricated, absent fields simply stay unset (see
 * every _liveExtra field's own optionality in routes/matches.ts). */
export function extractMrDogeSoccerLiveExtra(stats: SoccerStats | null | undefined): {
  cornersHome?: number;
  cornersAway?: number;
  cornersTotal?: number;
  cardsHome?: number;
  cardsAway?: number;
  cardsTotal?: number;
  possessionHome?: number;
  possessionAway?: number;
  shotsTotalHome?: number;
  shotsTotalAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  woodworkHome?: number;
  woodworkAway?: number;
} {
  if (!stats) return {};
  const cardsHome =
    stats.homeYellowCards != null || stats.homeRedCards != null
      ? (stats.homeYellowCards ?? 0) + (stats.homeRedCards ?? 0)
      : undefined;
  const cardsAway =
    stats.awayYellowCards != null || stats.awayRedCards != null
      ? (stats.awayYellowCards ?? 0) + (stats.awayRedCards ?? 0)
      : undefined;
  return {
    cornersHome: stats.homeCorners,
    cornersAway: stats.awayCorners,
    cornersTotal:
      stats.homeCorners != null && stats.awayCorners != null
        ? stats.homeCorners + stats.awayCorners
        : undefined,
    cardsHome,
    cardsAway,
    cardsTotal: cardsHome != null && cardsAway != null ? cardsHome + cardsAway : undefined,
    // Mr. Doge sends possession as a 0-1 fraction; BET62's _liveExtra
    // possessionHome/Away fields (frontend V2StatsGroup renderer) expect a
    // 0-100 percentage, same convention every other provider used here.
    possessionHome: stats.homePossession != null ? Math.round(stats.homePossession * 100) : undefined,
    possessionAway: stats.awayPossession != null ? Math.round(stats.awayPossession * 100) : undefined,
    shotsTotalHome: stats.homeShots,
    shotsTotalAway: stats.awayShots,
    shotsOnTargetHome: stats.homeShotsOnTarget,
    shotsOnTargetAway: stats.awayShotsOnTarget,
    woodworkHome: stats.homeWoodworkHits,
    woodworkAway: stats.awayWoodworkHits,
  };
}
