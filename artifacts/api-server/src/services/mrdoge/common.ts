// Mr. Doge (api.mrdoge.co) — pure mapping/extraction helpers, no I/O. See
// client.ts's header and lib/config.ts's MRDOGE_API_KEY comment for the
// provider's real confirmed scope (6 of BET62's 8 sports; darts/MMA are
// not covered by this provider at all).
import type {
  BaseballStats,
  BasketballStats,
  Clock,
  IceHockeyStats,
  Match,
  Market,
  SoccerStats,
  TennisStats,
  VolleyballStats,
} from "@mrdoge/node";

/** Shared `Period[]` -> BET62's `Array<[home, away]>` tuple convention
 * (sets/quarters/periods/innings, all the same shape in every sport's
 * stats). Keeps only periods that have been played or are in progress —
 * periods not yet reached (both scores null, not inPlay) are left out
 * entirely rather than padded with fabricated zeros. */
function periodsToTuples(
  periods: Array<{ homeScore: number | null; awayScore: number | null; inPlay: boolean }> | undefined,
): Array<[number, number]> {
  if (!periods) return [];
  return periods
    .filter((p) => p.homeScore != null || p.awayScore != null || p.inPlay)
    .map((p): [number, number] => [p.homeScore ?? 0, p.awayScore ?? 0]);
}

/** Non-soccer clock -> a plain display status string. Unlike football,
 * these sports have no literal-string checks elsewhere in matches.ts to
 * match, so this just surfaces Mr. Doge's own pre-formatted label —
 * `isFinishedVisibilityStatus` already matches on "finished" via
 * substring, so the finished case still visually resolves matches. */
export function mrDogeGenericStatus(clock: Clock | null | undefined): string {
  if (!clock) return "";
  const state = String(clock.state ?? "").toLowerCase();
  const display = String(clock.displayLong ?? clock.display ?? clock.state ?? "");
  if (clock.state === "finished") return "Finished";
  if (
    state === "interrupted" ||
    state === "suspended" ||
    state === "paused" ||
    /interrupt|suspend|pause|abandon|delay|postpon/i.test(display)
  ) {
    return "Interrompido";
  }
  return display;
}

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

export const MRDOGE_SOCCER_BET_TYPES = [
  "SOCCER_MATCH_RESULT_PRELIVE",
  "SOCCER_MATCH_RESULT",
  "SOCCER_UNDER_OVER",
  "SOCCER_BOTH_TEAMS_TO_SCORE",
  "SOCCER_DOUBLE_CHANCE",
  "SOCCER_MATCH_RESULT_NODRAW",
  "SOCCER_CORRECT_SCORE_EXTENDED",
  "SOCCER_FIRST_HALF_RESULT",
  "SOCCER_FIRST_HALF_UNDER_OVER",
  "SOCCER_SECOND_HALF_RESULT",
  "SOCCER_HALFTIME_FULLTIME",
  "SOCCER_MATCH_RESULT_HANDICAP",
  "SOCCER_HOME_UNDER_OVER",
  "SOCCER_AWAY_UNDER_OVER",
  "SOCCER_HOME_CLEAN_SHEET",
  "SOCCER_AWAY_CLEAN_SHEET",
  "SOCCER_GOALS_ODD_EVEN",
  "SOCCER_HOME_WIN_TO_NIL",
  "SOCCER_AWAY_WIN_TO_NIL",
  "SOCCER_MATCH_RESULT_ASIAN",
  "SOCCER_ASIAN_UNDER_OVER",
  "SOCCER_NUMBER_OF_GOALS",
] as const;

export function mrDogeMatchId(bet62Sport: string, match: Match): string {
  return `${MRDOGE_ID_PREFIX[bet62Sport] ?? `mrdoge-${bet62Sport}-`}${match.id}`;
}

export function mrDogeTeamLogo(teamId: number | string | null | undefined): string | undefined {
  if (teamId == null || teamId === "") return undefined;
  return `https://api.mrdoge.co/images/teams/${teamId}.png`;
}

export function mrDogeRegionFlag(regionId: number | string | null | undefined): string | undefined {
  if (regionId == null || regionId === "") return undefined;
  return `https://api.mrdoge.co/images/regions/${regionId}.png`;
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

type MrDogeMarketLine = Market["lines"][number];

export type MrDogeSoccerExtendedMarkets = {
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  drawNoBet?: { home: number; away: number };
  asianHandicap?: { line: number; home: number; away: number };
  halfTime?: { home: number; draw: number; away: number };
  firstHalfTotal?: { line: number; over: number; under: number };
  secondHalf?: { home: number; draw: number; away: number };
  htft?: {
    hh: number;
    hd: number;
    ha: number;
    dh: number;
    dd: number;
    da: number;
    ah: number;
    ad: number;
    aa: number;
  };
  correctScore?: Record<string, number>;
  europeanHandicap?: { line: number; home: number; draw: number; away: number };
  asianTotals?: Partial<{
    o05: number;
    u05: number;
    o45: number;
    u45: number;
    o55: number;
    u55: number;
    o225: number;
    u225: number;
    o275: number;
    u275: number;
  }>;
  teamGoals?: Partial<{
    homeOver05: number;
    homeUnder05: number;
    homeOver15: number;
    homeUnder15: number;
    homeOver25: number;
    homeUnder25: number;
    awayOver05: number;
    awayUnder05: number;
    awayOver15: number;
    awayUnder15: number;
    awayOver25: number;
    awayUnder25: number;
  }>;
  winToNil?: { home: number; away: number };
  cleanSheet?: { home: number; away: number };
  goalOddEven?: { odd: number; even: number };
  exactGoals?: Partial<{
    g0: number;
    g1: number;
    g2: number;
    g3: number;
    g4: number;
    g5plus: number;
  }>;
};

function mrDogeLineCode(line: MrDogeMarketLine): string {
  return String(line.code ?? "").trim().toUpperCase();
}

function mrDogeLineCaption(line: MrDogeMarketLine): string {
  return String((line as { caption?: unknown }).caption ?? "").trim();
}

function mrDogeIsAvailable(line: MrDogeMarketLine): boolean {
  return line.isAvailable && Number.isFinite(line.price) && line.price > 1.001;
}

function mrDogeParseNumericValue(text: string): number | undefined {
  const matches = text.match(/[+-]?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) return undefined;
  const value = Number(matches[matches.length - 1]!.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function mrDogeReadNumericCandidate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return mrDogeParseNumericValue(value);
  }
  return undefined;
}

function mrDogeParseOverUnderLine(
  market: Market,
  line: MrDogeMarketLine,
): { side: "over" | "under"; line: number } | null {
  const code = mrDogeLineCode(line);
  const text = `${mrDogeLineCaption(line)} ${String(market.displayName ?? "")}`.trim();
  const side =
    code === "O" || code.startsWith("O") || /\bover\b|mais de/i.test(text)
      ? "over"
      : code === "U" || code.startsWith("U") || /\bunder\b|menos de/i.test(text)
        ? "under"
        : null;
  if (!side) return null;

  const fromCode = /^([OU])([+-]?\d+(?:\.\d+)?)$/i.exec(code);
  const raw = line as Record<string, unknown>;
  const marketAny = market as Record<string, unknown>;
  const lineValue =
    fromCode != null
      ? Number(fromCode[2])
      : mrDogeParseNumericValue(text) ??
        mrDogeReadNumericCandidate(raw["line"]) ??
        mrDogeReadNumericCandidate(raw["handicap"]) ??
        mrDogeReadNumericCandidate(raw["spread"]) ??
        mrDogeReadNumericCandidate(raw["value"]) ??
        mrDogeReadNumericCandidate(raw["point"]) ??
        mrDogeReadNumericCandidate(raw["points"]) ??
        mrDogeReadNumericCandidate(marketAny["line"]) ??
        mrDogeReadNumericCandidate(marketAny["handicap"]) ??
        mrDogeReadNumericCandidate(marketAny["spread"]) ??
        mrDogeReadNumericCandidate(marketAny["value"]) ??
        mrDogeReadNumericCandidate(marketAny["point"]) ??
        mrDogeReadNumericCandidate(marketAny["points"]);
  if (!Number.isFinite(lineValue)) return null;
  return { side, line: lineValue };
}

function mrDogeParseSignedNumericValue(text: string): number | undefined {
  const match = text.match(/[+-]\s*\d+(?:[.,]\d+)?/);
  if (match) {
    const value = Number(match[0].replace(/\s+/g, "").replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return mrDogeParseNumericValue(text);
}

function mrDogeParseAsianHandicapLine(market: Market): number | undefined {
  const marketAny = market as Record<string, unknown>;
  const candidateTexts: string[] = [
    String(market.displayName ?? ""),
    String(marketAny["caption"] ?? ""),
    String(marketAny["name"] ?? ""),
  ];
  const candidateUnknowns: unknown[] = [
    marketAny["line"],
    marketAny["handicap"],
    marketAny["spread"],
    marketAny["value"],
    marketAny["point"],
    marketAny["points"],
    marketAny["hcp"],
    marketAny["hdp"],
  ];

  for (const line of market.lines) {
    const raw = line as Record<string, unknown>;
    candidateTexts.push(mrDogeLineCaption(line));
    candidateUnknowns.push(
      raw["line"],
      raw["handicap"],
      raw["spread"],
      raw["value"],
      raw["point"],
      raw["points"],
      raw["hcp"],
      raw["hdp"],
    );
  }

  for (const value of candidateUnknowns) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = mrDogeParseSignedNumericValue(value);
      if (parsed != null) return parsed;
    }
  }

  for (const text of candidateTexts) {
    const parsed = mrDogeParseSignedNumericValue(text);
    if (parsed != null) return parsed;
  }

  return undefined;
}

function mrDogeExtractThreeWayResult(
  markets: Market[] | undefined,
  betType: string,
): { home: number; draw: number; away: number } | null {
  if (!markets) return null;
  const market = markets.find((m) => m.betType === betType);
  if (!market) return null;
  const available = market.lines.filter(mrDogeIsAvailable);
  const home = available.find((line) => mrDogeLineCode(line) === "1")?.price;
  const draw = available.find((line) => mrDogeLineCode(line) === "X")?.price;
  const away = available.find((line) => mrDogeLineCode(line) === "2")?.price;
  if (!home || !draw || !away) return null;
  return { home, draw, away };
}

function mrDogeExtractTwoWayResult(
  markets: Market[] | undefined,
  betType: string,
): { home: number; away: number } | null {
  if (!markets) return null;
  const market = markets.find((m) => m.betType === betType);
  if (!market) return null;
  const available = market.lines.filter(mrDogeIsAvailable);
  const home = available.find((line) => mrDogeLineCode(line) === "1")?.price;
  const away = available.find((line) => mrDogeLineCode(line) === "2")?.price;
  if (!home || !away) return null;
  return { home, away };
}

function mrDogeExtractYesNo(
  markets: Market[] | undefined,
  betType: string,
): { yes: number; no: number } | null {
  if (!markets) return null;
  const market = markets.find((m) => m.betType === betType);
  if (!market) return null;
  const available = market.lines.filter(mrDogeIsAvailable);
  if (available.length < 2) return null;

  const yesLine =
    available.find((line) => /^(Y|YES|GG)$/i.test(mrDogeLineCode(line))) ??
    available.find((line) => /\byes\b|\bsim\b/i.test(mrDogeLineCaption(line)));
  const noLine =
    available.find((line) => /^(N|NO|NG)$/i.test(mrDogeLineCode(line))) ??
    available.find((line) => /\bno\b|\bnão\b|\bnao\b/i.test(mrDogeLineCaption(line)));

  if (yesLine && noLine) return { yes: yesLine.price, no: noLine.price };
  return { yes: available[0]!.price, no: available[1]!.price };
}

function mrDogeExtractYesPrice(
  markets: Market[] | undefined,
  betType: string,
): number | undefined {
  const yesNo = mrDogeExtractYesNo(markets, betType);
  return yesNo?.yes;
}

function mrDogeParseCorrectScore(text: string): string | undefined {
  const exact = /(\d+)\s*-\s*(\d+)/.exec(text);
  if (exact) return `${Number(exact[1])}-${Number(exact[2])}`;
  if (/any|qualquer|other|outro/i.test(text)) return "Outro";
  return undefined;
}

/** Real football extraction wired only to betTypes observed in live API
 * probes. Parsing is defensive because Mr. Doge's line codes/captions vary
 * between markets ("Y/N", "1/X/2", "Over 1.5", "1/2", etc.). */
export function extractMrDogeSoccerMoneyline(
  markets: Market[] | undefined,
): { home: number; draw: number; away: number } | null {
  return (
    mrDogeExtractThreeWayResult(markets, "SOCCER_MATCH_RESULT") ??
    mrDogeExtractThreeWayResult(markets, "SOCCER_MATCH_RESULT_PRELIVE")
  );
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
      if (!mrDogeIsAvailable(line)) continue;
      const parsed = mrDogeParseOverUnderLine(market, line);
      if (!parsed) continue;
      const entry = byLine.get(parsed.line) ?? {};
      if (parsed.side === "over") entry.over = line.price;
      else entry.under = line.price;
      byLine.set(parsed.line, entry);
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
  return mrDogeExtractYesNo(markets, "SOCCER_BOTH_TEAMS_TO_SCORE");
}

function mrDogeExtractSingleLineOverUnder(
  markets: Market[] | undefined,
  betType: string,
  preferredLine?: number,
): { line: number; over: number; under: number } | null {
  if (!markets) return null;
  const byLine = new Map<number, { over?: number; under?: number }>();
  for (const market of markets) {
    if (market.betType !== betType) continue;
    for (const line of market.lines) {
      if (!mrDogeIsAvailable(line)) continue;
      const parsed = mrDogeParseOverUnderLine(market, line);
      if (!parsed) continue;
      const entry = byLine.get(parsed.line) ?? {};
      if (parsed.side === "over") entry.over = line.price;
      else entry.under = line.price;
      byLine.set(parsed.line, entry);
    }
  }

  const complete = Array.from(byLine.entries())
    .filter(([, entry]) => entry.over != null && entry.under != null)
    .map(([line, entry]) => ({
      line,
      over: entry.over!,
      under: entry.under!,
    }));
  if (complete.length === 0) return null;
  if (preferredLine == null) return complete[0]!;

  complete.sort(
    (a, b) =>
      Math.abs(a.line - preferredLine) - Math.abs(b.line - preferredLine) ||
      a.line - b.line,
  );
  return complete[0]!;
}

export function extractMrDogeSoccerExtendedMarkets(
  markets: Market[] | undefined,
): MrDogeSoccerExtendedMarkets {
  const out: MrDogeSoccerExtendedMarkets = {};
  if (!markets || markets.length === 0) return out;

  const dc = markets.find((m) => m.betType === "SOCCER_DOUBLE_CHANCE");
  if (dc) {
    const available = dc.lines.filter(mrDogeIsAvailable);
    const homeOrDraw = available.find((line) => mrDogeLineCode(line) === "1X")?.price ?? 0;
    const awayOrDraw = available.find((line) => mrDogeLineCode(line) === "X2")?.price ?? 0;
    const homeOrAway = available.find((line) => mrDogeLineCode(line) === "12")?.price ?? 0;
    if (homeOrDraw > 0 || awayOrDraw > 0 || homeOrAway > 0) {
      out.doubleChance = { homeOrDraw, awayOrDraw, homeOrAway };
    }
  }

  const dnb = mrDogeExtractTwoWayResult(markets, "SOCCER_MATCH_RESULT_NODRAW");
  if (dnb) out.drawNoBet = dnb;

  const firstHalfTotal = mrDogeExtractSingleLineOverUnder(
    markets,
    "SOCCER_FIRST_HALF_UNDER_OVER",
    1.5,
  );
  if (firstHalfTotal) out.firstHalfTotal = firstHalfTotal;

  const asianMarkets = markets
    .filter((m) => m.betType === "SOCCER_MATCH_RESULT_ASIAN")
    .map((market) => {
      const prices = mrDogeExtractTwoWayResult([market], "SOCCER_MATCH_RESULT_ASIAN");
      if (!prices) return null;
      const line = mrDogeParseAsianHandicapLine(market);
      if (line == null) return null;
      return { line, ...prices };
    })
    .filter((entry): entry is { line: number; home: number; away: number } => entry != null)
    .sort((a, b) => Math.abs(a.line) - Math.abs(b.line));
  if (asianMarkets.length > 0) out.asianHandicap = asianMarkets[0]!;

  const halfTime = mrDogeExtractThreeWayResult(markets, "SOCCER_FIRST_HALF_RESULT");
  if (halfTime) out.halfTime = halfTime;

  const secondHalf = mrDogeExtractThreeWayResult(markets, "SOCCER_SECOND_HALF_RESULT");
  if (secondHalf) out.secondHalf = secondHalf;

  const htftMarket = markets.find((m) => m.betType === "SOCCER_HALFTIME_FULLTIME");
  if (htftMarket) {
    const mapped: NonNullable<MrDogeSoccerExtendedMarkets["htft"]> = {
      hh: 0, hd: 0, ha: 0, dh: 0, dd: 0, da: 0, ah: 0, ad: 0, aa: 0,
    };
    const selMap: Record<string, keyof typeof mapped> = {
      "1/1": "hh",
      "1/X": "hd",
      "1/2": "ha",
      "X/1": "dh",
      "X/X": "dd",
      "X/2": "da",
      "2/1": "ah",
      "2/X": "ad",
      "2/2": "aa",
    };
    for (const line of htftMarket.lines) {
      if (!mrDogeIsAvailable(line)) continue;
      const key = selMap[mrDogeLineCode(line)];
      if (key) mapped[key] = line.price;
    }
    if (Object.values(mapped).some((price) => price > 0)) out.htft = mapped;
  }

  const correctScoreMarket = markets.find((m) => m.betType === "SOCCER_CORRECT_SCORE_EXTENDED");
  if (correctScoreMarket) {
    const scores: Record<string, number> = {};
    for (const line of correctScoreMarket.lines) {
      if (!mrDogeIsAvailable(line)) continue;
      const score =
        mrDogeParseCorrectScore(mrDogeLineCaption(line)) ??
        mrDogeParseCorrectScore(mrDogeLineCode(line));
      if (score) scores[score] = line.price;
    }
    if (Object.keys(scores).length > 0) out.correctScore = scores;
  }

  const euroMarkets = markets
    .filter((m) => m.betType === "SOCCER_MATCH_RESULT_HANDICAP")
    .map((market) => {
      const prices = mrDogeExtractThreeWayResult([market], "SOCCER_MATCH_RESULT_HANDICAP");
      if (!prices) return null;
      const sample = market.lines.find(mrDogeIsAvailable);
      const lineValue = sample ? mrDogeParseNumericValue(mrDogeLineCaption(sample)) : undefined;
      if (lineValue == null) return null;
      return { line: lineValue, ...prices };
    })
    .filter((entry): entry is { line: number; home: number; draw: number; away: number } => entry != null)
    .sort((a, b) => Math.abs(a.line) - Math.abs(b.line));
  if (euroMarkets.length > 0) out.europeanHandicap = euroMarkets[0]!;

  const asianTotals: NonNullable<MrDogeSoccerExtendedMarkets["asianTotals"]> = {};
  const asianKeyByLine: Record<string, ["o05" | "o45" | "o55" | "o225" | "o275", "u05" | "u45" | "u55" | "u225" | "u275"]> = {
    "0.5": ["o05", "u05"],
    "2.25": ["o225", "u225"],
    "2.75": ["o275", "u275"],
    "4.5": ["o45", "u45"],
    "5.5": ["o55", "u55"],
  };
  for (const market of markets) {
    if (market.betType !== "SOCCER_ASIAN_UNDER_OVER") continue;
    for (const line of market.lines) {
      if (!mrDogeIsAvailable(line)) continue;
      const parsed = mrDogeParseOverUnderLine(market, line);
      if (!parsed) continue;
      const target = asianKeyByLine[String(parsed.line)];
      if (!target) continue;
      const key = parsed.side === "over" ? target[0] : target[1];
      asianTotals[key] = line.price;
    }
  }
  if (Object.keys(asianTotals).length > 0) out.asianTotals = asianTotals;

  const teamGoals: NonNullable<MrDogeSoccerExtendedMarkets["teamGoals"]> = {};
  const teamGoalSuffixByLine: Record<string, "05" | "15" | "25"> = {
    "0.5": "05",
    "1.5": "15",
    "2.5": "25",
  };
  for (const market of markets) {
    const sidePrefix =
      market.betType === "SOCCER_HOME_UNDER_OVER"
        ? "home"
        : market.betType === "SOCCER_AWAY_UNDER_OVER"
          ? "away"
          : null;
    if (!sidePrefix) continue;
    for (const line of market.lines) {
      if (!mrDogeIsAvailable(line)) continue;
      const parsed = mrDogeParseOverUnderLine(market, line);
      if (!parsed) continue;
      const suffix = teamGoalSuffixByLine[String(parsed.line)];
      if (!suffix) continue;
      const key = `${sidePrefix}${parsed.side === "over" ? "Over" : "Under"}${suffix}` as keyof typeof teamGoals;
      teamGoals[key] = line.price;
    }
  }
  if (Object.keys(teamGoals).length > 0) out.teamGoals = teamGoals;

  const winToNil = {
    home: mrDogeExtractYesPrice(markets, "SOCCER_HOME_WIN_TO_NIL") ?? 0,
    away: mrDogeExtractYesPrice(markets, "SOCCER_AWAY_WIN_TO_NIL") ?? 0,
  };
  if (winToNil.home > 0 || winToNil.away > 0) out.winToNil = winToNil;

  const cleanSheet = {
    home: mrDogeExtractYesPrice(markets, "SOCCER_HOME_CLEAN_SHEET") ?? 0,
    away: mrDogeExtractYesPrice(markets, "SOCCER_AWAY_CLEAN_SHEET") ?? 0,
  };
  if (cleanSheet.home > 0 || cleanSheet.away > 0) out.cleanSheet = cleanSheet;

  const oddEvenMarket = markets.find((m) => m.betType === "SOCCER_GOALS_ODD_EVEN");
  if (oddEvenMarket) {
    const odd =
      oddEvenMarket.lines.find((line) => mrDogeIsAvailable(line) && mrDogeLineCode(line) === "1")?.price ??
      oddEvenMarket.lines.find((line) => mrDogeIsAvailable(line) && /\bodd\b|ímpar|impar/i.test(mrDogeLineCaption(line)))?.price ??
      0;
    const even =
      oddEvenMarket.lines.find((line) => mrDogeIsAvailable(line) && mrDogeLineCode(line) === "0")?.price ??
      oddEvenMarket.lines.find((line) => mrDogeIsAvailable(line) && /\beven\b|par/i.test(mrDogeLineCaption(line)))?.price ??
      0;
    if (odd > 0 || even > 0) out.goalOddEven = { odd, even };
  }

  const exactGoalsMarket = markets.find((m) => m.betType === "SOCCER_NUMBER_OF_GOALS");
  if (exactGoalsMarket) {
    const exactGoals: NonNullable<MrDogeSoccerExtendedMarkets["exactGoals"]> = {};
    for (const line of exactGoalsMarket.lines) {
      if (!mrDogeIsAvailable(line)) continue;
      const caption = mrDogeLineCaption(line);
      const code = mrDogeLineCode(line);
      const text = `${caption} ${code}`.trim();
      let key: keyof typeof exactGoals | undefined;
      if (/no goals|sem golos|sem gols/i.test(text) || code === "0000") key = "g0";
      else if (/5\+|5 ou mais|5 or more/i.test(text)) key = "g5plus";
      else {
        const value = mrDogeParseNumericValue(caption);
        if (value === 0) key = "g0";
        else if (value === 1) key = "g1";
        else if (value === 2) key = "g2";
        else if (value === 3) key = "g3";
        else if (value === 4) key = "g4";
        else if (value != null && value >= 5) key = "g5plus";
      }
      if (key) exactGoals[key] = line.price;
    }
    if (Object.keys(exactGoals).length > 0) out.exactGoals = exactGoals;
  }

  return out;
}

function scoreGenericMoneylineMarket(market: Market): number {
  const available = market.lines.filter((line) => line.isAvailable);
  if (available.length < 2) return -1_000;
  const codes = new Set(available.map((line) => String(line.code).toUpperCase()));
  const betType = String(market.betType ?? "").toUpperCase();

  let score = 0;
  const isThreeWay = codes.has("1") && codes.has("X") && codes.has("2");
  const isTwoWay = codes.has("1") && codes.has("2") && available.length === 2;
  if (isThreeWay) score += 100;
  else if (isTwoWay) score += 80;
  else return -1_000;

  if (betType.includes("RESULT")) score += 40;
  if (betType.includes("MONEYLINE")) score += 35;
  if (betType.includes("WINNER")) score += 30;
  if (betType.includes("MATCH")) score += 20;
  if (betType.includes("PRELIVE")) score += 10;
  if (betType.includes("TOTAL")) score -= 50;
  if (betType.includes("HANDICAP")) score -= 50;
  if (betType.includes("SET")) score -= 35;
  if (betType.includes("GAME")) score -= 35;
  if (betType.includes("QUARTER")) score -= 35;
  if (betType.includes("PERIOD")) score -= 35;
  if (betType.includes("HALF")) score -= 35;
  if (betType.includes("TEAM")) score -= 20;

  return score;
}

export function extractMrDogeGenericMoneyline(
  markets: Market[] | undefined,
): { home: number; draw: number; away: number } | null {
  if (!markets || markets.length === 0) return null;

  const ranked = [...markets]
    .map((market) => ({ market, score: scoreGenericMoneylineMarket(market) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.market;
  if (!best) return null;

  const home = best.lines.find((line) => line.isAvailable && String(line.code).toUpperCase() === "1")?.price;
  const away = best.lines.find((line) => line.isAvailable && String(line.code).toUpperCase() === "2")?.price;
  const draw = best.lines.find((line) => line.isAvailable && String(line.code).toUpperCase() === "X")?.price ?? 0;
  if (!home || !away) return null;
  return { home, draw, away };
}

/** Real per-team football stats this tick, straight off Mr. Doge's
 * SoccerStats — never fabricated, absent fields simply stay unset (see
 * every _liveExtra field's own optionality in routes/matches.ts). */
export function extractMrDogeSoccerLiveExtra(stats: SoccerStats | null | undefined): {
  cornersHome?: number;
  cornersAway?: number;
  cornersTotal?: number;
  foulsHome?: number;
  foulsAway?: number;
  cardsHome?: number;
  cardsAway?: number;
  cardsTotal?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHomeCount?: number;
  redCardsAwayCount?: number;
  possessionHome?: number;
  possessionAway?: number;
  shotsTotalHome?: number;
  shotsTotalAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  offsidesHome?: number;
  offsidesAway?: number;
  xgHome?: number;
  xgAway?: number;
  throwInsHome?: number;
  throwInsAway?: number;
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
    foulsHome: stats.homeFouls,
    foulsAway: stats.awayFouls,
    cardsHome,
    cardsAway,
    cardsTotal: cardsHome != null && cardsAway != null ? cardsHome + cardsAway : undefined,
    yellowCardsHome: stats.homeYellowCards,
    yellowCardsAway: stats.awayYellowCards,
    redCardsHomeCount: stats.homeRedCards,
    redCardsAwayCount: stats.awayRedCards,
    // Mr. Doge sends possession as a 0-1 fraction; BET62's _liveExtra
    // possessionHome/Away fields (frontend V2StatsGroup renderer) expect a
    // 0-100 percentage, same convention every other provider used here.
    possessionHome: stats.homePossession != null ? Math.round(stats.homePossession * 100) : undefined,
    possessionAway: stats.awayPossession != null ? Math.round(stats.awayPossession * 100) : undefined,
    shotsTotalHome: stats.homeShots,
    shotsTotalAway: stats.awayShots,
    shotsOnTargetHome: stats.homeShotsOnTarget,
    shotsOnTargetAway: stats.awayShotsOnTarget,
    offsidesHome: stats.homeOffsides,
    offsidesAway: stats.awayOffsides,
    xgHome: stats.homeExpectedGoals,
    xgAway: stats.awayExpectedGoals,
    throwInsHome: stats.homeThrowIns,
    throwInsAway: stats.awayThrowIns,
    woodworkHome: stats.homeWoodworkHits,
    woodworkAway: stats.awayWoodworkHits,
  };
}

function formatStatValue(
  value: number | null | undefined,
  options?: { digits?: number; suffix?: string },
): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const digits = options?.digits ?? (Number.isInteger(value) ? 0 : 1);
  return `${value.toFixed(digits)}${options?.suffix ?? ""}`;
}

function pushSoccerStatRow(
  rows: Array<{ name: string; home: string; away: string }>,
  name: string,
  home: number | null | undefined,
  away: number | null | undefined,
  options?: { digits?: number; suffix?: string },
): void {
  if (home == null && away == null) return;
  rows.push({
    name,
    home: formatStatValue(home, options),
    away: formatStatValue(away, options),
  });
}

export function buildMrDogeSoccerMatchStats(
  stats: SoccerStats | null | undefined,
): Array<{ title: string; rows: Array<{ name: string; home: string; away: string }> }> {
  if (!stats) return [];

  const overviewRows: Array<{ name: string; home: string; away: string }> = [];
  pushSoccerStatRow(
    overviewRows,
    "Posse de bola",
    stats.homePossession != null ? Math.round(stats.homePossession * 100) : undefined,
    stats.awayPossession != null ? Math.round(stats.awayPossession * 100) : undefined,
    { suffix: "%" },
  );
  pushSoccerStatRow(overviewRows, "Remates", stats.homeShots, stats.awayShots);
  pushSoccerStatRow(
    overviewRows,
    "Remates enquadrados",
    stats.homeShotsOnTarget,
    stats.awayShotsOnTarget,
  );
  pushSoccerStatRow(overviewRows, "Cantos", stats.homeCorners, stats.awayCorners);
  pushSoccerStatRow(
    overviewRows,
    "Cartoes amarelos",
    stats.homeYellowCards,
    stats.awayYellowCards,
  );
  pushSoccerStatRow(
    overviewRows,
    "Cartoes vermelhos",
    stats.homeRedCards,
    stats.awayRedCards,
  );
  pushSoccerStatRow(overviewRows, "Faltas", stats.homeFouls, stats.awayFouls);
  pushSoccerStatRow(overviewRows, "Fora de jogo", stats.homeOffsides, stats.awayOffsides);

  const extraRows: Array<{ name: string; home: string; away: string }> = [];
  pushSoccerStatRow(
    extraRows,
    "xG",
    stats.homeExpectedGoals,
    stats.awayExpectedGoals,
    { digits: 2 },
  );
  pushSoccerStatRow(
    extraRows,
    "Bola ao poste",
    stats.homeWoodworkHits,
    stats.awayWoodworkHits,
  );
  pushSoccerStatRow(extraRows, "Lancamentos", stats.homeThrowIns, stats.awayThrowIns);
  pushSoccerStatRow(extraRows, "Pontapes de baliza", stats.homeGoalKicks, stats.awayGoalKicks);
  pushSoccerStatRow(extraRows, "Penaltis", stats.homePenaltyKicks, stats.awayPenaltyKicks);
  pushSoccerStatRow(extraRows, "Desarmes", stats.homeTackles, stats.awayTackles);

  const groups: Array<{ title: string; rows: Array<{ name: string; home: string; away: string }> }> = [];
  if (overviewRows.length > 0) groups.push({ title: "Resumo do jogo", rows: overviewRows });
  if (extraRows.length > 0) groups.push({ title: "Estatisticas avancadas", rows: extraRows });
  return groups;
}

function timelineMinute(
  event: { captions?: string[]; timeOffsetSeconds?: number },
): number {
  const fromCaption = event.captions?.[0] ?? "";
  const minuteMatch = /(\d{1,3})/.exec(fromCaption);
  if (minuteMatch) return Number(minuteMatch[1]);
  if (event.timeOffsetSeconds != null && Number.isFinite(event.timeOffsetSeconds)) {
    return Math.max(0, Math.round(event.timeOffsetSeconds / 60));
  }
  return 0;
}

function timelineTeam(
  match: Match,
  side: string | null | undefined,
  captions?: string[],
): string {
  if (side === "home") return match.homeTeam.name;
  if (side === "away") return match.awayTeam.name;
  const captionTeam = captions?.[1]?.trim();
  return captionTeam || "";
}

function timelinePlayer(captions?: string[]): string {
  if (!captions || captions.length === 0) return "";
  return captions[captions.length - 1]?.trim() ?? "";
}

export function buildMrDogeTimelineEvents(match: Match): Array<{
  type: string;
  team: string;
  minute: number;
  player: string;
  detail?: string;
}> {
  const timeline = match.timeline ?? [];
  const events: Array<{
    type: string;
    team: string;
    minute: number;
    player: string;
    detail?: string;
  }> = [];

  for (const event of timeline) {
    let type = "event";
    let detail: string | undefined;

    switch (event.type) {
      case "GoalWithScorer":
        type = "goal";
        detail = "Golo";
        break;
      case "OwnGoal":
        type = "goal";
        detail = "Autogolo";
        break;
      case "YellowCardWithPlayer":
        type = "card";
        detail = "Amarelo";
        break;
      case "RedCardWithPlayer":
        type = "card";
        detail = "Vermelho";
        break;
      case "PenaltyKick":
        detail = "Penalti";
        break;
      case "Corner":
        detail = "Canto";
        break;
      case "Substitution":
        detail = "Substituicao";
        break;
      default:
        continue;
    }

    events.push({
      type,
      team: timelineTeam(match, event.side, event.captions),
      minute: timelineMinute(event),
      player: timelinePlayer(event.captions),
      detail,
    });
  }

  return events;
}

/** Real tennis live state — no odds/markets yet (Fase 0 probe needed
 * before guessing any tennis betType sysname, see this file's header). */
export function extractMrDogeTennisLiveExtra(stats: TennisStats | null | undefined): {
  sets?: Array<[number, number]>;
  currentPoints?: [number | string, number | string];
  serving?: [boolean, boolean];
} {
  if (!stats) return {};
  const sets = periodsToTuples(stats.periods).map((tuple, i, arr): [number, number] => {
    // The in-progress set's period entry only gets a real score once the
    // set finishes — homeGamesInCurrentSet/awayGamesInCurrentSet is the
    // live source for the last (current) entry while it's still 0/0.
    const isLast = i === arr.length - 1;
    if (isLast && tuple[0] === 0 && tuple[1] === 0) {
      return [stats.homeGamesInCurrentSet ?? 0, stats.awayGamesInCurrentSet ?? 0];
    }
    return tuple;
  });
  return {
    sets: sets.length ? sets : undefined,
    currentPoints:
      stats.homeCurrentGamePoints != null && stats.awayCurrentGamePoints != null
        ? [stats.homeCurrentGamePoints, stats.awayCurrentGamePoints]
        : undefined,
    serving:
      stats.homeServes != null && stats.awayServes != null ? [stats.homeServes, stats.awayServes] : undefined,
  };
}

/** Real basketball live state — no odds/markets yet (same Fase 0 caveat). */
export function extractMrDogeBasketballLiveExtra(stats: BasketballStats | null | undefined): {
  quarters?: Array<[number, number]>;
  clockStr?: string;
  clockSec?: number;
  clockRunning?: boolean;
} {
  if (!stats) return {};
  const quarters = periodsToTuples(stats.periods);
  return {
    quarters: quarters.length ? quarters : undefined,
    clockStr: stats.clock?.display ?? undefined,
    clockSec: stats.clock?.remainingSeconds ?? stats.clock?.elapsedSeconds ?? undefined,
    clockRunning: stats.clock?.state === "live",
  };
}

/** Real ice hockey live state — no odds/markets yet (same Fase 0 caveat). */
export function extractMrDogeIceHockeyLiveExtra(stats: IceHockeyStats | null | undefined): {
  periods?: Array<[number, number]>;
  clockStr?: string;
  clockSec?: number;
  clockRunning?: boolean;
} {
  if (!stats) return {};
  const periods = periodsToTuples(stats.periods);
  return {
    periods: periods.length ? periods : undefined,
    clockStr: stats.clock?.display ?? undefined,
    clockSec: stats.clock?.remainingSeconds ?? stats.clock?.elapsedSeconds ?? undefined,
    clockRunning: stats.clock?.state === "live",
  };
}

/** Real baseball live state — no odds/markets yet (same Fase 0 caveat).
 * `bases` is untyped (`unknown[]`) at the protocol level, so it's left out
 * rather than guessed at. */
export function extractMrDogeBaseballLiveExtra(stats: BaseballStats | null | undefined): {
  innings?: Array<[number, number]>;
  outs?: number;
} {
  if (!stats) return {};
  const innings = periodsToTuples(stats.periods);
  return {
    innings: innings.length ? innings : undefined,
    outs: stats.outs,
  };
}

/** Real volleyball live state — no odds/markets yet (same Fase 0 caveat).
 * The in-progress set's period entry IS the live point score (volleyball
 * sets run well past a typical "sets won" count, so no games-in-current-set
 * substitute like tennis is needed here). */
export function extractMrDogeVolleyballLiveExtra(stats: VolleyballStats | null | undefined): {
  currentPts?: [number, number];
  vollSets?: Array<[number, number]>;
} {
  if (!stats) return {};
  const periods = stats.periods ?? [];
  const current = periods.find((p) => p.inPlay);
  const vollSets = periods
    .filter((p) => !p.inPlay && (p.homeScore != null || p.awayScore != null))
    .map((p): [number, number] => [p.homeScore ?? 0, p.awayScore ?? 0]);
  return {
    currentPts: current ? [current.homeScore ?? 0, current.awayScore ?? 0] : undefined,
    vollSets: vollSets.length ? vollSets : undefined,
  };
}
