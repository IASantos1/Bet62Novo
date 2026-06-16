import { db, betsTable, cashoutStatesTable, usersTable, settlementLogsTable, settlementIdempotencyTable } from "@workspace/db";
import { eq, and, lt, sql, gte, desc } from "drizzle-orm";
import IORedis from "ioredis";
import { logger } from "./lib/logger.js";
import { applyBalanceDelta } from "./lib/ledger.js";
import { ensureFinishedMatchResult, finishedMatchResults, liveMatchState, scanDailyForFinished, scanV2AllSportsForFinished } from "./routes/matches.js";

export type SelectionRecord = {
  matchId?: string;
  matchTitle?: string;
  homeTeam?: string;
  awayTeam?: string;
  kickoffTime?: string;
  scheduledAt?: string;
  selection: string;
  odd?: number;
  market?: string;
  label?: string;
  finalScore?: { home: number; away: number };
  htScore?: { htHome: number; htAway: number };
  outcome?: "won" | "lost" | "void" | "half_won" | "half_lost" | null;
  pendingReason?: string;
  settlementNote?: string;
  lastSettledAt?: string;
  settlementRuleVersion?: string;
};

export type FTScore = { home: number; away: number };
export type HTScore = { htHome: number; htAway: number };
export type FinishedResult = (typeof finishedMatchResults extends Map<string, infer V> ? V : never);
export type LiveResult = (typeof liveMatchState extends Map<string, infer V> ? V : never);
export type SettlementOutcome = "won" | "lost" | "void" | "half_won" | "half_lost" | null;
export type SelectionSettlementResolution = {
  outcome: SettlementOutcome;
  pendingReason?: string;
};

const SETTLEMENT_LOCK_TTL_SECONDS = 300;

let settlementRedis: IORedis | null | undefined;

function getSettlementRedis(): IORedis | null {
  if (settlementRedis !== undefined) return settlementRedis;
  const url = process.env["REDIS_URL"];
  if (typeof url !== "string" || url.trim() === "") {
    settlementRedis = null;
    return settlementRedis;
  }
  settlementRedis = new IORedis(url, { maxRetriesPerRequest: null });
  return settlementRedis;
}

async function acquireBetSettlementLock(betId: number | string, owner: string): Promise<boolean> {
  const redis = getSettlementRedis();
  if (!redis) return true;
  const key = `settlement:lock:bet:${String(betId)}`;
  const result = await redis.set(key, owner, "NX", "EX", SETTLEMENT_LOCK_TTL_SECONDS);
  return result === "OK";
}

async function releaseBetSettlementLock(betId: number | string, owner: string): Promise<void> {
  const redis = getSettlementRedis();
  if (!redis) return;
  const key = `settlement:lock:bet:${String(betId)}`;
  const currentOwner = await redis.get(key);
  if (currentOwner === owner) {
    await redis.del(key);
  }
}

async function ensureSettlementTransitionIdempotency(
  tx: any,
  args: {
    betId: number;
    trigger: string;
    oldStatus: string;
    newStatus: string;
    matchId?: string;
    jobId?: string;
  },
): Promise<boolean> {
  const idempotencyKey = [
    "bet", String(args.betId),
    "trigger", args.trigger,
    "old", String(args.oldStatus ?? ""),
    "new", String(args.newStatus ?? ""),
    args.matchId ? `match:${String(args.matchId)}` : "",
    args.jobId ? `job:${String(args.jobId)}` : "",
  ]
    .filter(Boolean)
    .join(":");

  const rows = await tx
    .insert(settlementIdempotencyTable)
    .values({
      idempotencyKey,
      betId: args.betId,
      trigger: args.trigger,
      oldStatus: args.oldStatus,
      newStatus: args.newStatus,
      matchId: args.matchId,
      jobId: args.jobId,
      engineVersion: "2025.06-v4",
    })
    .onConflictDoNothing()
    .returning({ idempotencyKey: settlementIdempotencyTable.idempotencyKey });

  return rows.length > 0;
}

function buildSettlementLogKey(args: {
  betId: number;
  oldStatus: string;
  newStatus: string;
  event: string;
  matchId?: string;
  jobId?: string;
}): string {
  const betId = String(args.betId);
  const oldStatus = String(args.oldStatus ?? "");
  const newStatus = String(args.newStatus ?? "");
  const event = String(args.event ?? "");
  const matchId = args.matchId ? String(args.matchId) : "";
  const jobId = args.jobId ? String(args.jobId) : "";
  return ["bet", betId, "old", oldStatus, "new", newStatus, "event", event, matchId ? `match:${matchId}` : "", jobId ? `job:${jobId}` : ""]
    .filter(Boolean)
    .join(":");
}

const IMMEDIATE_VOID_SETTLEMENT_STATUSES = new Set([
  "cancelled",
  "cancl",
  "abandoned",
  "abd",
  "walkover",
  "wo",
  "retired",
  "ret",
]);

const DELAYED_VOID_SETTLEMENT_STATUSES = new Set([
  "postponed",
  "postp",
  "delayed",
  "delay",
  "susp",
  "suspended",
  "interrupted",
  "rain delay",
]);

const BLOCKED_LIVE_SETTLEMENT_STATUSES = new Set([
  "not started",
  "scheduled",
  "fixture",
  "to be defined",
  ...IMMEDIATE_VOID_SETTLEMENT_STATUSES,
  ...DELAYED_VOID_SETTLEMENT_STATUSES,
]);

function normalizeSettlementStatus(status: string | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function matchesSettlementStatus(status: string | undefined, candidates: Set<string>): boolean {
  const normalized = normalizeSettlementStatus(status);
  if (!normalized) return false;
  if (candidates.has(normalized)) return true;
  for (const candidate of candidates) {
    if (normalized.includes(candidate)) return true;
  }
  return false;
}

function resolveSettlementStatusOutcome(
  status: string | undefined,
  finishedAt?: number,
): "void" | "pending" | null {
  if (matchesSettlementStatus(status, IMMEDIATE_VOID_SETTLEMENT_STATUSES)) {
    return "void";
  }
  if (matchesSettlementStatus(status, DELAYED_VOID_SETTLEMENT_STATUSES)) {
    const threshold = 72 * 60 * 60 * 1000;
    if (finishedAt && Date.now() - finishedAt > threshold) {
      return "void";
    }
    return "pending";
  }
  return null;
}

function blocksLiveEarlySettlement(status: string | undefined): boolean {
  return matchesSettlementStatus(status, BLOCKED_LIVE_SETTLEMENT_STATUSES);
}

function decodeCompactLine(token: string): number {
  const raw = String(token ?? "").trim();
  if (!raw) return Number.NaN;
  if (raw.includes(".")) return parseFloat(raw);
  if (/^\d+$/.test(raw) && raw.length >= 2) return parseInt(raw, 10) / 10;
  return parseFloat(raw);
}

function parseSelectionLabelLine(label: unknown): number | null {
  if (typeof label !== "string") return null;
  const match = label.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]!.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseSignedSelectionLabelLine(label: unknown): number | null {
  if (typeof label !== "string") return null;
  const normalized = label.replace(/[−–]/g, "-").replace(/\s+/g, " ");
  const signed = normalized.match(/([+-])\s*(\d+(?:[.,]\d+)?)/);
  if (signed) {
    const sign = signed[1] === "-" ? -1 : 1;
    const value = Number(signed[2]!.replace(",", "."));
    return Number.isFinite(value) ? sign * value : null;
  }
  return parseSelectionLabelLine(label);
}

function splitAsianLine(line: number): number[] {
  if (!Number.isFinite(line)) return [];
  const scaled = Math.round(line * 100);
  const mod = Math.abs(scaled) % 100;
  if (mod === 25) return [line - Math.sign(line || 1) * 0.25, line + Math.sign(line || 1) * 0.25];
  if (mod === 75) return [line - Math.sign(line || 1) * 0.25, line + Math.sign(line || 1) * 0.25];
  return [line];
}

function mergeAsianLegOutcomes(outcomes: Array<"won" | "lost" | "void">): SettlementOutcome {
  if (outcomes.length === 0) return null;
  if (outcomes.every((outcome) => outcome === outcomes[0])) return outcomes[0]!;
  if (outcomes.includes("won") && outcomes.includes("void")) return "half_won";
  if (outcomes.includes("lost") && outcomes.includes("void")) return "half_lost";
  return "void";
}

function settleAsianTotalOutcome(total: number, side: "over" | "under", line: number): SettlementOutcome {
  const outcomes = splitAsianLine(line).map((part) => {
    if (total === part) return "void" as const;
    if (side === "over") return total > part ? "won" as const : "lost" as const;
    return total < part ? "won" as const : "lost" as const;
  });
  return mergeAsianLegOutcomes(outcomes);
}

function settleAsianSideHandicapOutcome(
  home: number,
  away: number,
  side: "home" | "away",
  line: number,
): SettlementOutcome {
  const outcomes = splitAsianLine(line).map((part) => {
    const adjusted = side === "home" ? home + part - away : away + part - home;
    if (adjusted === 0) return "void" as const;
    return adjusted > 0 ? "won" as const : "lost" as const;
  });
  return mergeAsianLegOutcomes(outcomes);
}

function settlementOutcomeMultiplier(outcome: SettlementOutcome, odd: number | undefined): number | null {
  const price = Number(odd ?? 1);
  const normalizedOdd = Number.isFinite(price) ? price : 1;
  if (outcome === null) return null;
  if (outcome === "lost") return 0;
  if (outcome === "void") return 1;
  if (outcome === "won") return normalizedOdd;
  if (outcome === "half_lost") return 0.5;
  if (outcome === "half_won") return (normalizedOdd + 1) / 2;
  return null;
}

function computeResolvedTicketOdds(
  selections: SelectionRecord[],
  outcomes: SettlementOutcome[],
): number {
  return selections.reduce((acc, sel, idx) => {
    const multiplier = settlementOutcomeMultiplier(outcomes[idx] ?? null, sel.odd);
    return acc * (multiplier ?? 1);
  }, 1);
}

function inferSelectionSport(selection: string): "football" | "tennis" | "basketball" | "baseball" | "hockey" {
  const s = normalizeSettlementSelectionKey(selection);
  if (
    s.startsWith("set") ||
    s.startsWith("vs") ||
    s.startsWith("es-") ||
    s.startsWith("sh") ||
    s.startsWith("gh-") ||
    s.startsWith("ses-") ||
    s.includes("sets")
  ) return "tennis";
  if (s.startsWith("b-") || /^q[1234]-/.test(s) || s === "h1-home" || s === "h1-away") return "basketball";
  if (/^p[123]-/.test(s) || /^per[123]-/.test(s) || /^p[123]t-/.test(s) || s.startsWith("sog-") || s === "pl-home" || s === "pl-away") return "hockey";
  if (s.startsWith("mlb-") || s.startsWith("f5-") || s.startsWith("f5t-") || s.startsWith("rl-")) return "baseball";
  return "football";
}

function scoreOutcomeForSelLastResort(
  sel: { selection: string; label?: unknown },
  ft: FTScore,
  ht?: HTScore,
  extra?: { status?: string; cornersTotal?: number; cardsTotal?: number; firstGoal?: "home" | "away" | "none"; extras?: unknown; finishedAt?: number },
): SettlementOutcome {
  const s = normalizeSettlementSelectionKey(sel.selection);
  const sport = inferSelectionSport(s);
  const derivedHt = ht ?? getFootballHTScoreFromExtras(extra?.extras) ?? undefined;

  if (sport === "tennis") {
    if (/^es-(h20|h21|a02|a12)$/.test(s)) {
      const score = `${ft.home}-${ft.away}`;
      const want =
        s === "es-h20" ? "2-0" :
        s === "es-h21" ? "2-1" :
        s === "es-a02" ? "0-2" :
        "1-2";
      return score === want ? "won" : "lost";
    }
    if (/^([ou])sets(35|25)?$/.test(s)) {
      const m = s.match(/^([ou])sets(35|25)?$/)!;
      const dir = m[1]!;
      const line = (m[2] ?? "") === "35" ? 3.5 : 2.5;
      const totalSets = ft.home + ft.away;
      if (totalSets === line) return "void";
      return dir === "o" ? (totalSets > line ? "won" : "lost") : (totalSets < line ? "won" : "lost");
    }
  }

  if (sport === "football") {
    if ((s === "home" || s === "away" || s === "draw") && Number.isFinite(ft.home) && Number.isFinite(ft.away)) {
      if (s === "home") return ft.home > ft.away ? "won" : "lost";
      if (s === "away") return ft.away > ft.home ? "won" : "lost";
      return ft.home === ft.away ? "won" : "lost";
    }
    if (derivedHt) {
      const htHome = derivedHt.htHome;
      const htAway = derivedHt.htAway;
      const h2Home = ft.home - htHome;
      const h2Away = ft.away - htAway;
      if (s === "ht-home") return htHome > htAway ? "won" : "lost";
      if (s === "ht-away") return htAway > htHome ? "won" : "lost";
      if (s === "ht-draw") return htHome === htAway ? "won" : "lost";
      if (s === "b1h-yes") return htHome > 0 && htAway > 0 ? "won" : "lost";
      if (s === "b1h-no") return htHome === 0 || htAway === 0 ? "won" : "lost";
      if (s === "2h-home") return h2Home > h2Away ? "won" : "lost";
      if (s === "2h-away") return h2Away > h2Home ? "won" : "lost";
      if (s === "2h-draw") return h2Home === h2Away ? "won" : "lost";
      const h2Total = s.match(/^2h-([ou])(\d+)g$/);
      if (h2Total) {
        const line = decodeCompactLine(h2Total[2]!);
        const total2h = h2Home + h2Away;
        if (total2h === line) return "void";
        return h2Total[1] === "o" ? (total2h > line ? "won" : "lost") : (total2h < line ? "won" : "lost");
      }
    }
    if (/^[ou][\d.]+$/.test(s)) {
      const line = decodeCompactLine(s.slice(1));
      const total = ft.home + ft.away;
      if (!Number.isFinite(line)) return null;
      if (total === line) return "void";
      return s[0] === "o" ? (total > line ? "won" : "lost") : (total < line ? "won" : "lost");
    }
    if (s === "bts-yes") return ft.home > 0 && ft.away > 0 ? "won" : "lost";
    if (s === "bts-no") return ft.home === 0 || ft.away === 0 ? "won" : "lost";
  }

  if (sport === "basketball") {
    const quarters = getBasketballQuartersFromExtras(extra?.extras);
    if (/^b-pts-([ou])-(\d+(?:\.\d+)?)$/.test(s)) {
      const m = s.match(/^b-pts-([ou])-(\d+(?:\.\d+)?)$/)!;
      const line = Number(m[2]!);
      const total = ft.home + ft.away;
      if (total === line) return "void";
      return m[1] === "o" ? (total > line ? "won" : "lost") : (total < line ? "won" : "lost");
    }
    const q = s.match(/^q([1234])-(home|away)$/);
    if (q) {
      const qScore = quarters[Number(q[1]) - 1] ?? null;
      if (!qScore) return null;
      return q[2] === "home" ? (qScore[0] > qScore[1] ? "won" : "lost") : (qScore[1] > qScore[0] ? "won" : "lost");
    }
    if ((s === "h1-home" || s === "h1-away") && quarters.length >= 2) {
      const h1Home = (quarters[0]?.[0] ?? 0) + (quarters[1]?.[0] ?? 0);
      const h1Away = (quarters[0]?.[1] ?? 0) + (quarters[1]?.[1] ?? 0);
      return s === "h1-home" ? (h1Home > h1Away ? "won" : "lost") : (h1Away > h1Home ? "won" : "lost");
    }
    const h1Total = s.match(/^b-h1-pts-([ou])-(\d+(?:\.\d+)?)$/);
    if (h1Total && quarters.length >= 2) {
      const totalH1 = (quarters[0]?.[0] ?? 0) + (quarters[0]?.[1] ?? 0) + (quarters[1]?.[0] ?? 0) + (quarters[1]?.[1] ?? 0);
      const line = Number(h1Total[2]!);
      if (totalH1 === line) return "void";
      return h1Total[1] === "o" ? (totalH1 > line ? "won" : "lost") : (totalH1 < line ? "won" : "lost");
    }
  }

  if (sport === "hockey") {
    const periods = getHockeyPeriodsFromExtras(extra?.extras);
    const per = s.match(/^p([123])-(home|draw|away)$/) || s.match(/^per([123])-(home|draw|away)$/);
    if (per) {
      const score = periods[Number(per[1]) - 1] ?? null;
      if (!score) return null;
      if (per[2] === "draw") return score[0] === score[1] ? "won" : "lost";
      return per[2] === "home" ? (score[0] > score[1] ? "won" : "lost") : (score[1] > score[0] ? "won" : "lost");
    }
    const pt = s.match(/^p([123])t-([ou])(?:-(\d+(?:\.\d+)?))?$/);
    if (pt) {
      const score = periods[Number(pt[1]) - 1] ?? null;
      const line = pt[3] != null ? Number(pt[3]) : parseSelectionLabelLine(sel.label);
      if (!score || line == null) return null;
      const total = score[0] + score[1];
      if (total === line) return "void";
      return pt[2] === "o" ? (total > line ? "won" : "lost") : (total < line ? "won" : "lost");
    }
  }

  if (sport === "baseball") {
    const innings = getBaseballInningsFromExtras(extra?.extras);
    if (/^mlb-tot-([ou])-(\d+(?:\.\d+)?)$/.test(s) || /^mlb-([ou])(\d+(?:\.\d+)?)$/.test(s)) {
      const m = s.match(/^mlb-tot-([ou])-(\d+(?:\.\d+)?)$/) || s.match(/^mlb-([ou])(\d+(?:\.\d+)?)$/);
      const line = Number(m?.[2] ?? Number.NaN);
      const total = ft.home + ft.away;
      if (!Number.isFinite(line)) return null;
      if (total === line) return "void";
      return m?.[1] === "o" ? (total > line ? "won" : "lost") : (total < line ? "won" : "lost");
    }
    if (s === "winner" || s === "home" || s === "away") {
      if (s === "home") return ft.home > ft.away ? "won" : "lost";
      return ft.away > ft.home ? "won" : "lost";
    }
    const f5res = s.match(/^mlb-f5-(home|away)$/) || s.match(/^f5-(home|away)$/);
    if (f5res && innings.length >= 5) {
      const [h, a] = innings.slice(0, 5).reduce((acc, [ih, ia]) => [acc[0] + ih, acc[1] + ia] as [number, number], [0, 0] as [number, number]);
      if (h === a) return "void";
      return f5res[1] === "home" ? (h > a ? "won" : "lost") : (a > h ? "won" : "lost");
    }
    const f5t = s.match(/^mlb-f5t-([ou])-(\d+(?:\.\d+)?)$/) || s.match(/^f5t-([ou])$/);
    if (f5t && innings.length >= 5) {
      const total = innings.slice(0, 5).reduce((acc, [ih, ia]) => acc + ih + ia, 0);
      const line = f5t[2] != null ? Number(f5t[2]) : parseSelectionLabelLine(sel.label);
      if (line == null) return null;
      if (total === line) return "void";
      return f5t[1] === "o" ? (total > line ? "won" : "lost") : (total < line ? "won" : "lost");
    }
  }

  return null;
}

function describePendingSettlementReason(
  sel: { selection: string; label?: unknown },
  ft: FTScore,
  ht?: HTScore,
  extra?: { status?: string; cornersTotal?: number; cardsTotal?: number; firstGoal?: "home" | "away" | "none"; extras?: unknown; finishedAt?: number },
): string {
  const statusOutcome = resolveSettlementStatusOutcome(extra?.status, extra?.finishedAt);
  if (statusOutcome === "pending") return "status_delayed_window";

  const s = normalizeSettlementSelectionKey(sel.selection);
  const sport = inferSelectionSport(s);

  if (/^[ou]c\d+$/.test(s) && extra?.cornersTotal == null) return "missing_corners_total";
  if (/^[ou]card\d+$/.test(s) && extra?.cardsTotal == null) return "missing_cards_total";
  if ((s === "fg-home" || s === "fg-away" || s === "fg-none") && !extra?.firstGoal) return "missing_first_goal_data";
  const derivedHt = ht ?? getFootballHTScoreFromExtras(extra?.extras);
  if ((s.startsWith("ht-") || s.startsWith("htcs-") || s.startsWith("b1h-") || s.startsWith("wbh-") || s.startsWith("hsf-") || s.startsWith("htft-") || s.startsWith("2h-") || s.startsWith("h2cs-")) && (!derivedHt || derivedHt.htHome == null || derivedHt.htAway == null)) {
    return "missing_ht_score";
  }
  if (sport === "tennis") {
    const sets = getTennisSetsFromExtras(extra?.extras);
    if (sets.length === 0 && !(Number.isFinite(ft.home) && Number.isFinite(ft.away))) return "missing_tennis_sets";
    if ((/^set[123]-/.test(s) || /^vs[123][ha]$/.test(s) || /^ses-/.test(s) || /^sc[123]-/.test(s)) && sets.length === 0) return "missing_tennis_set_breakdown";
  }
  if (sport === "basketball") {
    const periods = getBasketballQuartersFromExtras(extra?.extras);
    if ((/^q[1234]-/.test(s) || s === "h1-home" || s === "h1-away" || /^b-h1-pts-/.test(s)) && periods.length === 0) return "missing_basketball_periods";
  }
  if (sport === "hockey") {
    const periods = getHockeyPeriodsFromExtras(extra?.extras);
    if ((/^p[123]-/.test(s) || /^per[123]-/.test(s) || /^p[123]t-/.test(s)) && periods.length === 0) return "missing_hockey_periods";
  }
  if (sport === "baseball" && (/^f5-/.test(s) || /^f5t-/.test(s) || /^mlb-f5-/.test(s) || /^mlb-f5t-/.test(s))) {
    if (!hasBaseballInnings(extra?.extras)) return "missing_baseball_innings";
  }

  return "market_known_but_unresolved";
}

export function resolveLiveSelectionSettlement(
  sel: SelectionRecord,
  score: {
    home: number;
    away: number;
    cornersTotal?: number;
    cardsTotal?: number;
    htScore?: [number, number] | null;
    status?: string;
    extras?: unknown;
  },
): SelectionSettlementResolution {
  const liveOutcome = liveDefinitiveOutcomeForSel(sel, score);
  if (liveOutcome !== null) return { outcome: liveOutcome };

  const ht =
    Array.isArray(score.htScore) && score.htScore.length >= 2
      ? { htHome: Number(score.htScore[0]), htAway: Number(score.htScore[1]) }
      : undefined;

  return {
    outcome: null,
    pendingReason: describePendingSettlementReason(
      sel,
      { home: score.home, away: score.away },
      ht,
      {
        status: score.status,
        cornersTotal: score.cornersTotal,
        cardsTotal: score.cardsTotal,
        extras: score.extras,
      },
    ),
  };
}

export function buildLiveSettlementScore(
  live: LiveResult | null,
): {
  home: number;
  away: number;
  cornersTotal?: number;
  cardsTotal?: number;
  htScore?: [number, number] | null;
  status?: string;
  extras?: unknown;
  tennisSets?: Array<[number, number]>;
  basketballQuarters?: Array<[number, number]>;
  hockeyPeriods?: Array<[number, number]>;
} | null {
  const homeScore = live ? Number((live as any).homeScore ?? NaN) : NaN;
  const awayScore = live ? Number((live as any).awayScore ?? NaN) : NaN;
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  const liveExtra = (live as any)?._liveExtra;
  const extras = liveExtra ?? {};
  const derivedHt = getFootballHTScoreFromExtras(extras);
  return {
    home: homeScore,
    away: awayScore,
    cornersTotal: liveExtra?.cornersTotal,
    cardsTotal: liveExtra?.cardsTotal,
    htScore: liveExtra?.htScore ?? (derivedHt ? [derivedHt.htHome, derivedHt.htAway] : null),
    status: (live as any)?.status,
    extras,
    tennisSets: Array.isArray(liveExtra?.sets) ? liveExtra.sets : getTennisSetsFromExtras(extras),
    basketballQuarters: Array.isArray(liveExtra?.quarters) ? liveExtra.quarters : getBasketballQuartersFromExtras(extras),
    hockeyPeriods: Array.isArray(liveExtra?.periods) ? liveExtra.periods : getHockeyPeriodsFromExtras(extras),
  };
}

export function resolveSelectionSettlement(
  sel: { selection: string; label?: unknown },
  ft: FTScore,
  ht?: HTScore,
  extra?: { status?: string; cornersTotal?: number; cardsTotal?: number; firstGoal?: "home" | "away" | "none"; extras?: unknown; finishedAt?: number },
): SelectionSettlementResolution {
  const derivedHt = ht ?? getFootballHTScoreFromExtras(extra?.extras) ?? undefined;
  const primary = scoreOutcomeForSel(sel, ft, derivedHt, extra);
  if (primary !== null) return { outcome: primary };

  const fallback = scoreOutcomeForSelLastResort(sel, ft, derivedHt, extra);
  if (fallback !== null) return { outcome: fallback };

  return {
    outcome: null,
    pendingReason: describePendingSettlementReason(sel, ft, derivedHt, extra),
  };
}

export function normalizeSettlementSelectionKey(selection: string): string {
  let s = String(selection ?? "");
  if (/^(?:handicap|asiatico|spread|puckline):/.test(s)) s = s.replace(/^[^:]+:/, "");
  if      (s === "1x2-home")    s = "home";
  else if (s === "1x2-draw")    s = "draw";
  else if (s === "1x2-away")    s = "away";
  else if (s === "hm1")         s = "hc-hm1";
  else if (s === "ap1")         s = "hc-ap1";
  else if (s === "hm1h")        s = "hc-hm15";
  else if (s === "ap1h")        s = "hc-ap15";
  else if (s === "hcap-home")   s = "hc-hm1";
  else if (s === "hcap-away")   s = "hc-ap1";
  else if (s === "ah:home")     s = "ah-home";
  else if (s === "ah:away")     s = "ah-away";
  else if (s === "pl:home")     s = "pl-home";
  else if (s === "pl:away")     s = "pl-away";
  else if (/^s([123])-(home|away)$/.test(s)) {
    const m = s.match(/^s([123])-(home|away)$/);
    s = `set${m![1]}-${m![2]}`;
  }
  else if (/^ts-([ou])(15|25|35|45)$/.test(s)) {
    const m = s.match(/^ts-([ou])(15|25|35|45)$/);
    s = `${m![1]}sets${m![2]}`;
  }
  else if (/^sh(\d+)-(home|away)\d*$/.test(s)) {
    const m = s.match(/^sh(\d+)-(home|away)\d*$/);
    s = `sh${m![1]}-${m![2]}`;
  }
  else if (/^gh-(home|away)\d*$/.test(s)) {
    const m = s.match(/^gh-(home|away)\d*$/);
    s = `gh-${m![1]}`;
  }
  else if (/^tg-([ou][\d.]+)$/.test(s)) s = s.slice(3);
  else if (/^cards-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^cards-([ou])(\d+)$/);
    s = `${m![1]}card${m![2]}`;
  }
  else if (/^corners-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^corners-([ou])(\d+)$/);
    s = `${m![1]}c${m![2]}`;
  }
  else if (s === "dc-12")       s = "homeOrAway";
  else if (s === "eg-0")        s = "eg-g0";
  else if (s === "eg-1")        s = "eg-g1";
  else if (s === "eg-2")        s = "eg-g2";
  else if (s === "eg-3")        s = "eg-g3";
  else if (s === "eg-4")        s = "eg-g4";
  else if (s === "eg-5p")       s = "eg-g5plus";
  else if (s === "et-res-home") s = "et-home";
  else if (s === "et-res-draw") s = "et-draw";
  else if (s === "et-res-away") s = "et-away";
  else if (s === "et-tie-home") s = "et-tw-home";
  else if (s === "et-tie-away") s = "et-tw-away";
  return s;
}

function parsePeriodsFromScore(scoreObj: unknown, maxPeriods = 5): number[] {
  if (!scoreObj || typeof scoreObj !== "object") return [];
  const out: number[] = [];
  for (let i = 1; i <= maxPeriods; i++) {
    const value = (scoreObj as Record<string, unknown>)[`period${i}`];
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

function getFootballHTScoreFromExtras(extras: unknown): HTScore | null {
  if (!extras || typeof extras !== "object") return null;
  const ex = extras as Record<string, unknown>;
  const football = ex["football"] as Record<string, unknown> | undefined;
  const directTuple = ex["htScore"];
  if (Array.isArray(directTuple) && directTuple.length >= 2) {
    const htHome = Number(directTuple[0]);
    const htAway = Number(directTuple[1]);
    if (Number.isFinite(htHome) && Number.isFinite(htAway)) return { htHome, htAway };
  }
  const htHome = typeof football?.["htHome"] === "number" ? football["htHome"] as number : null;
  const htAway = typeof football?.["htAway"] === "number" ? football["htAway"] as number : null;
  if (htHome !== null && htAway !== null) return { htHome, htAway };
  return null;
}

function getBasketballQuartersFromExtras(extras: unknown): Array<[number, number]> {
  if (!extras || typeof extras !== "object") return [];
  const ex = extras as Record<string, unknown>;
  const nested = ex["basketball"] as Record<string, unknown> | undefined;
  const direct = ex["quarters"];
  if (Array.isArray(direct)) {
    return direct
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [Number(entry[0]), Number(entry[1])] as [number, number] : null)
      .filter((entry): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1]));
  }
  if (nested && Array.isArray(nested["quarters"])) {
    return (nested["quarters"] as unknown[])
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [Number(entry[0]), Number(entry[1])] as [number, number] : null)
      .filter((entry): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1]));
  }
  const homePeriods = parsePeriodsFromScore(ex["homeScore"], 5);
  const awayPeriods = parsePeriodsFromScore(ex["awayScore"], 5);
  const len = Math.min(5, Math.max(homePeriods.length, awayPeriods.length));
  const quarters: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) {
    const h = homePeriods[i];
    const a = awayPeriods[i];
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    quarters.push([h!, a!]);
  }
  return quarters;
}

function getHockeyPeriodsFromExtras(extras: unknown): Array<[number, number]> {
  if (!extras || typeof extras !== "object") return [];
  const ex = extras as Record<string, unknown>;
  const nested = ex["hockey"] as Record<string, unknown> | undefined;
  const direct = ex["periods"];
  if (Array.isArray(direct)) {
    return direct
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [Number(entry[0]), Number(entry[1])] as [number, number] : null)
      .filter((entry): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1]));
  }
  if (nested && Array.isArray(nested["periods"])) {
    return (nested["periods"] as unknown[])
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [Number(entry[0]), Number(entry[1])] as [number, number] : null)
      .filter((entry): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1]));
  }
  const homePeriods = parsePeriodsFromScore(ex["homeScore"], 5);
  const awayPeriods = parsePeriodsFromScore(ex["awayScore"], 5);
  const len = Math.min(5, Math.max(homePeriods.length, awayPeriods.length));
  const periods: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) {
    const h = homePeriods[i];
    const a = awayPeriods[i];
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    periods.push([h!, a!]);
  }
  return periods;
}

function hasBaseballInnings(extras: unknown): boolean {
  if (!extras || typeof extras !== "object") return false;
  const ex = extras as Record<string, unknown>;
  const nested = ex["baseball"] as Record<string, unknown> | undefined;
  if (Array.isArray(ex["innings"])) return true;
  if (nested && Array.isArray(nested["innings"])) return true;
  const hs = ex["homeScore"] as Record<string, unknown> | undefined;
  const as = ex["awayScore"] as Record<string, unknown> | undefined;
  return !!hs?.["innings"] && !!as?.["innings"];
}

function getBaseballInningsFromExtras(extras: unknown): Array<[number, number]> {
  if (!extras || typeof extras !== "object") return [];
  const ex = extras as Record<string, unknown>;
  const nested = ex["baseball"] as Record<string, unknown> | undefined;
  const direct = Array.isArray(ex["innings"]) ? ex["innings"] : Array.isArray(nested?.["innings"]) ? nested?.["innings"] : null;
  if (Array.isArray(direct)) {
    return direct
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [Number(entry[0]), Number(entry[1])] as [number, number] : null)
      .filter((entry): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1]));
  }
  const hs = ex["homeScore"] as Record<string, unknown> | undefined;
  const as = ex["awayScore"] as Record<string, unknown> | undefined;
  const inningsH = (hs?.["innings"] as Record<string, unknown> | undefined) ?? undefined;
  const inningsA = (as?.["innings"] as Record<string, unknown> | undefined) ?? undefined;
  if (!inningsH || !inningsA) return [];
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= 12; i++) {
    const hInn = inningsH[`inning${i}`] as Record<string, unknown> | undefined;
    const aInn = inningsA[`inning${i}`] as Record<string, unknown> | undefined;
    const h = typeof hInn?.["run"] === "number" ? hInn["run"] as number : null;
    const a = typeof aInn?.["run"] === "number" ? aInn["run"] as number : null;
    if (h === null || a === null) continue;
    out.push([h, a]);
  }
  return out;
}

function getTennisSetsFromExtras(extras: unknown): Array<[number, number]> {
  if (!extras || typeof extras !== "object") return [];
  const ex = extras as Record<string, unknown>;
  const nested = ex["tennis"];
  if (nested && typeof nested === "object" && Array.isArray((nested as Record<string, unknown>)["sets"])) {
    return ((nested as Record<string, unknown>)["sets"] as unknown[])
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [Number(entry[0]), Number(entry[1])] as [number, number] : null)
      .filter((entry): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1]));
  }

  const homePeriods = parsePeriodsFromScore(ex["homeScore"]);
  const awayPeriods = parsePeriodsFromScore(ex["awayScore"]);
  const len = Math.max(homePeriods.length, awayPeriods.length);
  const sets: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) {
    const h = homePeriods[i];
    const a = awayPeriods[i];
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    if ((h ?? 0) === 0 && (a ?? 0) === 0) continue;
    sets.push([h!, a!]);
  }
  return sets;
}

function tennisSetFinished(setScore: [number, number]): boolean {
  const [homeGames, awayGames] = setScore;
  if (!Number.isFinite(homeGames) || !Number.isFinite(awayGames)) return false;
  const maxGames = Math.max(homeGames, awayGames);
  const diff = Math.abs(homeGames - awayGames);
  if (maxGames >= 7) return true;
  return maxGames >= 6 && diff >= 2;
}

function tennisCompletedSetCount(extras: unknown): number | null {
  const sets = getTennisSetsFromExtras(extras);
  if (sets.length === 0) return null;
  return sets.filter(tennisSetFinished).length;
}

/**
 * Evaluate a single bet selection against a known final score + optional HT score.
 * Returns "won" | "lost" | null  (null = data not available yet, or void/push bet).
 *
 * sel.selection key catalogue:
 *   FT: home | away | draw | homeOrDraw | awayOrDraw | homeOrAway
 *       dc-hd | dc-da | dc-ha  (alt double-chance keys)
 *       bts-yes | bts-no
 *       o{N} | u{N}   (total goals, e.g. o25 = over 2.5)
 *       goe-odd | goe-even
 *       wtn-h | wtn-a  (win to nil)
 *       cs-h | cs-a    (clean sheet)
 *       cs-{H}-{A}     (correct score FT)
 *       eg-g{N} | eg-g5plus  (exact total goals)
 *       dnb-home | dnb-away  (draw no bet — void on draw)
 *       tgh-{o|u}{N}   (home team goals O/U, e.g. tgh-o05)
 *       tga-{o|u}{N}   (away team goals O/U)
 *   HT-required: ht-home | ht-draw | ht-away
 *       b1h-yes | b1h-no
 *       htcs-{H}-{A} | htcs-Outro
 *       htft-{hda}{hda}
 *       wbh-h | wbh-a
 *       hsf-1 | hsf-2 | hsf-e
 *   2H-required: 2h-home | 2h-draw | 2h-away
 *       2h-{o|u}{N}g   (e.g. 2h-o05g)
 *       h2cs-{H}-{A}
 */
export function scoreOutcomeForSel(
  sel: { selection: string; label?: unknown },
  ft: FTScore,
  ht?: HTScore,
  extra?: { status?: string; cornersTotal?: number; cardsTotal?: number; firstGoal?: "home" | "away" | "none"; extras?: unknown; finishedAt?: number }
): SettlementOutcome {
  const statusOutcome = resolveSettlementStatusOutcome(extra?.status, extra?.finishedAt);
  if (statusOutcome) {
    return statusOutcome === "pending" ? null : statusOutcome;
  }

  // ── Key normalisation (ComprehensiveMarketsSheet keys → canonical keys) ────
  let s = normalizeSettlementSelectionKey(sel.selection);
  const ex = (extra?.extras ?? {}) as Record<string, unknown>;
  const fx = ex["football"] as Record<string, unknown> | undefined;

  const ftHome90 = typeof fx?.["ftHome"] === "number" ? (fx["ftHome"] as number) : null;
  const ftAway90 = typeof fx?.["ftAway"] === "number" ? (fx["ftAway"] as number) : null;

  const isExtraScoped = s.startsWith("et-") || s === "pen-home" || s === "pen-away";
  const home = (!isExtraScoped && ftHome90 !== null && ftAway90 !== null) ? ftHome90 : ft.home;
  const away = (!isExtraScoped && ftHome90 !== null && ftAway90 !== null) ? ftAway90 : ft.away;
  const total = home + away;

  const htH = ht?.htHome ?? null;
  const htA = ht?.htAway ?? null;
  const h2H = htH !== null ? home - htH : null;
  const h2A = htA !== null ? away - htA : null;

  let winning: boolean | null = null;
  let voided = false;

  // ── Corners O/U (requires stats) ──────────────────────────────────────────
  if (/^[ou]c\d+$/.test(s)) {
    if (extra?.cornersTotal == null) return null;
    const line = decodeCompactLine(s.slice(2));
    if (!Number.isFinite(line)) return null;
    if (extra.cornersTotal === line) voided = true;
    else winning = s[0] === "o" ? extra.cornersTotal > line : extra.cornersTotal < line;
  }
  // ── Cards O/U (requires stats) ────────────────────────────────────────────
  else if (/^[ou]card\d+$/.test(s)) {
    if (extra?.cardsTotal == null) return null;
    const line = decodeCompactLine(s.slice(5));
    if (!Number.isFinite(line)) return null;
    if (extra.cardsTotal === line) voided = true;
    else winning = s[0] === "o" ? extra.cardsTotal > line : extra.cardsTotal < line;
  }
  // ── Asian totals (settle full win/loss/void; quarter split stays pending) ─
  else if (/^at-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^at-([ou])(\d+)$/)!;
    const side = m[1] === "o" ? "over" : "under";
    const line = decodeCompactLine(m[2]!);
    return settleAsianTotalOutcome(total, side, line);
  }
  // ── First goal (requires stats) ───────────────────────────────────────────
  else if (s === "fg-home" || s === "fg-away" || s === "fg-none") {
    if (!extra?.firstGoal) return null;
    winning = s === `fg-${extra.firstGoal}`;
  }
  // ── Set winners (tennis/volleyball — requires per-period scores) ──────────
  else if (/^set[123]-(home|away)$/.test(s) || /^vs[123][ha]$/.test(s)) {
    const setNum =
      s.startsWith("set") ? parseInt(s.slice(3, 4), 10)
      : parseInt(s.slice(2, 3), 10);
    const wantHome = s.endsWith("home") || s.endsWith("h");
    const wantAway = s.endsWith("away") || s.endsWith("a");
    if (!Number.isFinite(setNum) || setNum <= 0) return null;
    const setScore = getTennisSetsFromExtras(extra?.extras)[setNum - 1] ?? null;
    const h = setScore?.[0] ?? null;
    const a = setScore?.[1] ?? null;
    if (h === null || a === null) return null;
    if (!tennisSetFinished([h, a])) return null;
    if (h === a) return "void";
    winning = wantHome ? h > a : wantAway ? a > h : null;
  }
  // ── Asian handicap (settle full win/loss/void; quarter split stays pending)
  else if (s === "ah-home" || s === "ah-away") {
    const side = s.endsWith("home") ? "home" : "away";
    const line = parseSignedSelectionLabelLine(sel.label);
    if (line == null || !Number.isFinite(line)) return null;
    return settleAsianSideHandicapOutcome(home, away, side, line);
  }
  // ── Exact sets (tennis) ───────────────────────────────────────────────────
  else if (/^es-(h20|h21|a02|a12)$/.test(s)) {
    const sets = getTennisSetsFromExtras(extra?.extras);
    const hc = sets.filter(([h, a]) => tennisSetFinished([h, a]) && h > a).length;
    const ac = sets.filter(([h, a]) => tennisSetFinished([h, a]) && a > h).length;
    if (hc === null || ac === null) return null;
    const score = `${hc}-${ac}`;
    const want =
      s === "es-h20" ? "2-0" :
      s === "es-h21" ? "2-1" :
      s === "es-a02" ? "0-2" :
      "1-2";
    winning = score === want;
  }
  // ── Total sets O/U (tennis) ───────────────────────────────────────────────
  else if (/^([ou])sets(35|25)?$/.test(s)) {
    const m = s.match(/^([ou])sets(35|25)?$/)!;
    const dir = m[1]!;
    const suf = m[2] ?? "";
    const line = suf === "35" ? 3.5 : 2.5;
    const totalSets = tennisCompletedSetCount(extra?.extras);
    if (totalSets === null) return null;
    if (totalSets === line) voided = true;
    else winning = dir === "o" ? totalSets > line : totalSets < line;
  }
  // ── Volleyball exact score (best-of-5) ────────────────────────────────────
  else if (/^vs-s(30|31|32|03|13|23)$/.test(s)) {
    const ex = (extra?.extras ?? {}) as Record<string, unknown>;
    const hs = ex["homeScore"] as Record<string, unknown> | undefined;
    const as = ex["awayScore"] as Record<string, unknown> | undefined;
    const hc = typeof hs?.["current"] === "number" ? hs["current"] as number : null;
    const ac = typeof as?.["current"] === "number" ? as["current"] as number : null;
    if (hc === null || ac === null) return null;
    const want = s.slice(4, 6);
    const score = `${hc}${ac}`;
    winning = score === want;
  }

  // ── Basketball (totals / spread / team totals / halves / quarters) ─────────
  else if (
    s.startsWith("b-") ||
    s.startsWith("q") && /^q[1234]-(home|away)$/.test(s) ||
    (s === "h1-home" || s === "h1-away")
  ) {
    const hs = ex["homeScore"] as Record<string, unknown> | undefined;
    const as = ex["awayScore"] as Record<string, unknown> | undefined;

    const period = (obj: Record<string, unknown> | undefined, n: number): number | null => {
      const v = obj?.[`period${n}`];
      return typeof v === "number" && Number.isFinite(v) ? (v as number) : null;
    };

    const q1H = period(hs, 1); const q1A = period(as, 1);
    const q2H = period(hs, 2); const q2A = period(as, 2);
    const q3H = period(hs, 3); const q3A = period(as, 3);
    const q4H = period(hs, 4); const q4A = period(as, 4);

    const regHome = (q1H ?? 0) + (q2H ?? 0) + (q3H ?? 0) + (q4H ?? 0);
    const regAway = (q1A ?? 0) + (q2A ?? 0) + (q3A ?? 0) + (q4A ?? 0);
    const hasRegBreakdown = (q1H !== null || q1A !== null || q2H !== null || q2A !== null || q3H !== null || q3A !== null || q4H !== null || q4A !== null);

    const parseLine = (str: string): number | null => {
      const n = Number(str);
      return Number.isFinite(n) ? n : null;
    };

    const tot = s.match(/^b-pts-([ou])-(\d+(?:\.\d+)?)$/);
    if (tot) {
      const dir = tot[1]!;
      const line = parseLine(tot[2]!);
      if (line === null) return null;
      const t = ft.home + ft.away;
      if (t === line) voided = true;
      else winning = dir === "o" ? t > line : t < line;
    }

    const totH1 = s.match(/^b-h1-pts-([ou])-(\d+(?:\.\d+)?)$/);
    if (winning === null && totH1) {
      const dir = totH1[1]!;
      const line = parseLine(totH1[2]!);
      if (line === null) return null;
      if (!hasRegBreakdown) return null;
      const t = (q1H ?? 0) + (q1A ?? 0) + (q2H ?? 0) + (q2A ?? 0);
      if (t === line) voided = true;
      else winning = dir === "o" ? t > line : t < line;
    }

    const spread = s.match(/^b-spread-(home|away)-(\d+(?:\.\d+)?)$/);
    if (winning === null && spread) {
      const side = spread[1]!;
      const line = parseLine(spread[2]!) ?? parseSelectionLabelLine(sel.label);
      if (line === null) return null;
      const diff = ft.home - ft.away;
      const adj = diff - line;
      if (adj === 0) voided = true;
      else winning = side === "home" ? adj > 0 : adj < 0;
    }

    const tt = s.match(/^b-tt-(home|away)-([ou])-(\d+(?:\.\d+)?)$/);
    if (winning === null && tt) {
      const side = tt[1]!;
      const dir = tt[2]!;
      const line = parseLine(tt[3]!);
      if (line === null) return null;
      const score = side === "home" ? ft.home : ft.away;
      if (score === line) voided = true;
      else winning = dir === "o" ? score > line : score < line;
    }

    const q = s.match(/^q([1234])-(home|away)$/);
    if (winning === null && q) {
      const qNum = Number(q[1]);
      const side = q[2]!;
      const qH = qNum === 1 ? q1H : qNum === 2 ? q2H : qNum === 3 ? q3H : q4H;
      const qA = qNum === 1 ? q1A : qNum === 2 ? q2A : qNum === 3 ? q3A : q4A;
      if (qH === null || qA === null) return null;
      if (qH === qA) voided = true;
      else winning = side === "home" ? qH > qA : qA > qH;
    }

    if (winning === null && (s === "h1-home" || s === "h1-away")) {
      if (!hasRegBreakdown) return null;
      const h1H = (q1H ?? 0) + (q2H ?? 0);
      const h1A = (q1A ?? 0) + (q2A ?? 0);
      if (h1H === h1A) voided = true;
      else winning = s === "h1-home" ? h1H > h1A : h1A > h1H;
    }
  }

  // ── Hockey (periods / period totals) ──────────────────────────────────────
  else if (
    /^p[123]-(home|draw|away)$/.test(s) ||
    /^per[123]-(home|draw|away)$/.test(s) ||
    /^p[123]t-([ou])(?:-(\d+(?:\.\d+)?))?$/.test(s) ||
    /^sog-([ou])(?:-(\d+(?:\.\d+)?))?$/.test(s)
  ) {
    const hs = ex["homeScore"] as Record<string, unknown> | undefined;
    const as = ex["awayScore"] as Record<string, unknown> | undefined;
    const p = (obj: Record<string, unknown> | undefined, n: number): number | null => {
      const v = obj?.[`period${n}`];
      return typeof v === "number" && Number.isFinite(v) ? (v as number) : null;
    };
    const p1H = p(hs, 1); const p1A = p(as, 1);
    const p2H = p(hs, 2); const p2A = p(as, 2);
    const p3H = p(hs, 3); const p3A = p(as, 3);

    const parseLine = (v: string | null | undefined): number | null => {
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const labelLine = parseSelectionLabelLine(sel.label);

    const perAlias = s.match(/^per([123])-(home|draw|away)$/);
    if (perAlias) s = `p${perAlias[1]}-${perAlias[2]}`;

    const per = s.match(/^p([123])-(home|draw|away)$/);
    if (per) {
      const n = Number(per[1]);
      const want = per[2]!;
      const h = n === 1 ? p1H : n === 2 ? p2H : p3H;
      const a = n === 1 ? p1A : n === 2 ? p2A : p3A;
      if (h === null || a === null) return null;
      if (want === "home") winning = h > a;
      else if (want === "away") winning = a > h;
      else winning = h === a;
    }

    const pt = s.match(/^p([123])t-([ou])(?:-(\d+(?:\.\d+)?))?$/);
    if (winning === null && pt) {
      const n = Number(pt[1]);
      const dir = pt[2]!;
      const line = parseLine(pt[3]) ?? labelLine;
      if (line === null) return null;
      const h = n === 1 ? p1H : n === 2 ? p2H : p3H;
      const a = n === 1 ? p1A : n === 2 ? p2A : p3A;
      if (h === null || a === null) return null;
      const t = h + a;
      if (t === line) voided = true;
      else winning = dir === "o" ? t > line : t < line;
    }

    if (winning === null && s.startsWith("sog-")) return null;
  }

  // ── Baseball (game totals / run line / F5) ────────────────────────────────
  else if (
    /^mlb-tot-([ou])-(\d+(?:\.\d+)?)$/.test(s) ||
    /^mlb-([ou])(\d+(?:\.\d+)?)$/.test(s) ||
    /^mlb-rl-(home|away)-(\d+(?:\.\d+)?)$/.test(s) ||
    /^rl-(home|away)$/.test(s) ||
    /^mlb-f5-(home|away)$/.test(s) ||
    /^f5-(home|away)$/.test(s) ||
    /^mlb-f5t-([ou])-(\d+(?:\.\d+)?)$/.test(s) ||
    /^f5t-([ou])$/.test(s)
  ) {
    const hs = ex["homeScore"] as Record<string, unknown> | undefined;
    const as = ex["awayScore"] as Record<string, unknown> | undefined;
    const inningsH = (hs?.["innings"] as Record<string, unknown> | undefined) ?? undefined;
    const inningsA = (as?.["innings"] as Record<string, unknown> | undefined) ?? undefined;

    const inningRun = (obj: Record<string, unknown> | undefined, i: number): number | null => {
      const inn = obj?.[`inning${i}`] as Record<string, unknown> | undefined;
      const r = inn?.["run"];
      return typeof r === "number" && Number.isFinite(r) ? (r as number) : null;
    };

    const parseLine = (v: string | null | undefined): number | null => {
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const labelLine = parseSelectionLabelLine(sel.label);

    const tot = s.match(/^mlb-tot-([ou])-(\d+(?:\.\d+)?)$/) || s.match(/^mlb-([ou])(\d+(?:\.\d+)?)$/);
    if (tot) {
      const dir = tot[1]!;
      const line = parseLine(tot[2])!;
      const t = ft.home + ft.away;
      if (t === line) voided = true;
      else winning = dir === "o" ? t > line : t < line;
    }

    const rl = s.match(/^mlb-rl-(home|away)-(\d+(?:\.\d+)?)$/) || s.match(/^rl-(home|away)$/);
    if (winning === null && rl) {
      const side = rl[1]!;
      const line = parseLine(rl[2]) ?? 1.5;
      if (line === null) return null;
      const diff = ft.home - ft.away;
      if (diff === line) voided = true;
      else winning = side === "home" ? diff > line : diff < line;
    }

    const f5res = s.match(/^mlb-f5-(home|away)$/) || s.match(/^f5-(home|away)$/);
    if (winning === null && f5res) {
      if (!inningsH || !inningsA) return null;
      let h = 0, a = 0;
      for (let i = 1; i <= 5; i++) {
        const rh = inningRun(inningsH, i);
        const ra = inningRun(inningsA, i);
        if (rh === null || ra === null) return null;
        h += rh; a += ra;
      }
      if (h === a) voided = true;
      else winning = f5res[1] === "home" ? h > a : a > h;
    }

    const f5t = s.match(/^mlb-f5t-([ou])-(\d+(?:\.\d+)?)$/) || s.match(/^f5t-([ou])$/);
    if (winning === null && f5t) {
      if (!inningsH || !inningsA) return null;
      const dir = f5t[1]!;
      const line = parseLine(f5t[2]) ?? labelLine;
      if (line === null) return null;
      let h = 0, a = 0;
      for (let i = 1; i <= 5; i++) {
        const rh = inningRun(inningsH, i);
        const ra = inningRun(inningsA, i);
        if (rh === null || ra === null) return null;
        h += rh; a += ra;
      }
      const t = h + a;
      if (t === line) voided = true;
      else winning = dir === "o" ? t > line : t < line;
    }
  }

  // ── Extra time (football) ─────────────────────────────────────────────────
  else if (s.startsWith("et-")) {
    const etHome = typeof fx?.["etHome"] === "number" ? (fx["etHome"] as number) : null;
    const etAway = typeof fx?.["etAway"] === "number" ? (fx["etAway"] as number) : null;
    const ftHome = typeof fx?.["ftHome"] === "number" ? (fx["ftHome"] as number) : null;
    const ftAway = typeof fx?.["ftAway"] === "number" ? (fx["ftAway"] as number) : null;

    if (etHome === null || etAway === null) return null;

    if (s === "et-home") winning = etHome > etAway;
    else if (s === "et-draw") winning = etHome === etAway;
    else if (s === "et-away") winning = etAway > etHome;
    else if (s === "et-tw-home" || s === "et-tw-away") {
      if (ftHome === null || ftAway === null) return null;
      const totalDiff = (ftHome + etHome) - (ftAway + etAway);
      if (totalDiff === 0) return null;
      winning = s === "et-tw-home" ? totalDiff > 0 : totalDiff < 0;
    } else if (/^et-([ou])(\d+)$/.test(s)) {
      const m = s.match(/^et-([ou])(\d+)$/)!;
      const line = decodeCompactLine(m[2]!);
      const totalET = etHome + etAway;
      if (totalET === line) voided = true;
      else winning = m[1] === "o" ? totalET > line : totalET < line;
    } else {
      return null;
    }
  }

  // ── Penalty shootout winner (football) ────────────────────────────────────
  else if (s === "pen-home" || s === "pen-away") {
    const penHome = typeof fx?.["penHome"] === "number" ? (fx["penHome"] as number) : null;
    const penAway = typeof fx?.["penAway"] === "number" ? (fx["penAway"] as number) : null;
    if (penHome === null || penAway === null) return null;
    if (penHome === penAway) return null;
    winning = s === "pen-home" ? penHome > penAway : penAway > penHome;
  }
  // ── Markets not resolvable from score alone — leave pending for admin ──────
  else if (
    s.startsWith("s1-")  || s.startsWith("s2-") ||        // tennis set winner (legacy keys)
    s.startsWith("ts-")  ||                                // tennis total sets (legacy keys)
    s.startsWith("hcp-")                                  // hcap points (no line)
  ) return null;

  // ── Handicap ±1 / ±1.5  (hc-hm1, hc-ap1, hc-hm15, hc-ap15) ─────────────
  if      (winning !== null) { /* already resolved above */ }
  else if (s === "hc-hm1"  || s === "hc-hm15") { winning = (home - away) >= 2; }
  else if (s === "hc-ap1"  || s === "hc-ap15") { winning = (home - away) <= 1; }
  else if (s === "pl-home" || s === "pl-away") {
    const side = s.endsWith("home") ? "home" : "away";
    const line = parseSignedSelectionLabelLine(sel.label) ?? (side === "home" ? -1.5 : 1.5);
    return settleAsianSideHandicapOutcome(home, away, side, line);
  }

  // ── 1X2 ───────────────────────────────────────────────────────────────────
  else if (s === "home")            winning = home > away;
  else if (s === "away")       winning = away > home;
  else if (s === "draw")       winning = home === away;

  // ── Double Chance ──────────────────────────────────────────────────────────
  else if (s === "homeOrDraw" || s === "dc-hd") winning = home >= away;
  else if (s === "awayOrDraw" || s === "dc-da") winning = away >= home;
  else if (s === "homeOrAway" || s === "dc-ha") winning = home !== away;

  // ── BTTS ───────────────────────────────────────────────────────────────────
  else if (s === "bts-yes")    winning = home > 0 && away > 0;
  else if (s === "bts-no")     winning = home === 0 || away === 0;

  // ── Total Goals O/U  (o25, u35, o05, etc.) ────────────────────────────────
  else if (/^[ou][\d.]+$/.test(s)) {
    const line = decodeCompactLine(s.slice(1));
    if (!isNaN(line)) {
      if (total === line) voided = true;
      else winning = s[0] === "o" ? total > line : total < line;
    }
  }

  // ── Goal Odd / Even ────────────────────────────────────────────────────────
  else if (s === "goe-odd")    winning = total % 2 === 1;
  else if (s === "goe-even")   winning = total % 2 === 0;

  // ── Win to Nil ─────────────────────────────────────────────────────────────
  else if (s === "wtn-h")      winning = home > away && away === 0;
  else if (s === "wtn-a")      winning = away > home && home === 0;

  // ── Clean Sheet  (cs-h = home keeps clean sheet; cs-a = away keeps) ────────
  else if (s === "cs-h")       winning = away === 0;
  else if (s === "cs-a")       winning = home === 0;

  // ── Exact Goals ────────────────────────────────────────────────────────────
  else if (s === "eg-g5plus")  winning = total >= 5;
  else if (/^eg-g(\d+)$/.test(s)) {
    winning = total === parseInt(s.slice(4), 10);
  }

  // ── Draw No Bet  (void = null on draw) ────────────────────────────────────
  else if (s === "dnb-home") {
    if (home === away) return "void";
    winning = home > away;
  } else if (s === "dnb-away") {
    if (home === away) return "void";
    winning = away > home;
  }

  // ── FT Correct Score  (cs-1-0, cs-2-1, cs-Outro) ─────────────────────────
  else if (s.startsWith("cs-")) {
    const body = s.slice(3);
    if (body === "Outro") {
      const common = [
        "0-0","1-0","0-1","1-1","2-0","0-2",
        "2-1","1-2","2-2","3-0","0-3","3-1","1-3","3-2","2-3",
      ];
      winning = !common.includes(`${home}-${away}`);
    } else {
      const parts = body.split("-");
      if (parts.length === 2) {
        const h = parseInt(parts[0]!, 10);
        const a = parseInt(parts[1]!, 10);
        if (!isNaN(h) && !isNaN(a)) winning = home === h && away === a;
      }
    }
  }

  // ── Home Team Goals O/U  (tgh-o05 = home scores > 0.5) ───────────────────
  else if (/^tgh-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^tgh-([ou])(\d+)$/)!;
    const line = decodeCompactLine(m[2]!);
    if (home === line) voided = true;
    else winning = m[1] === "o" ? home > line : home < line;
  }

  // ── Away Team Goals O/U  (tga-o15 = away scores > 1.5) ───────────────────
  else if (/^tga-([ou])(\d+)$/.test(s)) {
    const m = s.match(/^tga-([ou])(\d+)$/)!;
    const line = decodeCompactLine(m[2]!);
    if (away === line) voided = true;
    else winning = m[1] === "o" ? away > line : away < line;
  }

  // ══════════ MARKETS THAT REQUIRE HT SCORE ════════════════════════════════
  else if (
    s.startsWith("ht-")   || s.startsWith("htcs-") || s.startsWith("b1h-")  ||
    s.startsWith("wbh-")  || s.startsWith("hsf-")  || s.startsWith("htft-") ||
    s.startsWith("2h-")   || s.startsWith("h2cs-")
  ) {
    // If HT score not yet available, hold settlement until next cycle
    if (htH === null || htA === null) return null;

    // ── HT 1X2 ─────────────────────────────────────────────────────────────
    if      (s === "ht-home")  winning = htH > htA;
    else if (s === "ht-draw")  winning = htH === htA;
    else if (s === "ht-away")  winning = htA > htH;

    // ── BTTS 1st Half ──────────────────────────────────────────────────────
    else if (s === "b1h-yes")  winning = htH > 0 && htA > 0;
    else if (s === "b1h-no")   winning = htH === 0 || htA === 0;

    // ── HT Correct Score ───────────────────────────────────────────────────
    else if (s.startsWith("htcs-")) {
      const body = s.slice(5);
      if (body === "Outro") {
        const common = ["0-0","1-0","0-1","1-1","2-0","0-2","2-1","1-2"];
        winning = !common.includes(`${htH}-${htA}`);
      } else {
        const parts = body.split("-");
        if (parts.length === 2) {
          const h = parseInt(parts[0]!, 10);
          const a = parseInt(parts[1]!, 10);
          if (!isNaN(h) && !isNaN(a)) winning = htH === h && htA === a;
        }
      }
    }

    // ── Win Both Halves ─────────────────────────────────────────────────────
    else if (s === "wbh-h") {
      if (h2H !== null && h2A !== null) winning = htH > htA && h2H > h2A;
    } else if (s === "wbh-a") {
      if (h2H !== null && h2A !== null) winning = htA > htH && h2A > h2H;
    }

    // ── Highest Scoring Half ────────────────────────────────────────────────
    else if (s === "hsf-1" || s === "hsf-2" || s === "hsf-e") {
      if (h2H !== null && h2A !== null) {
        const firstHalfGoals  = htH + htA;
        const secondHalfGoals = h2H + h2A;
        if      (s === "hsf-1") winning = firstHalfGoals  > secondHalfGoals;
        else if (s === "hsf-2") winning = secondHalfGoals > firstHalfGoals;
        else                    winning = firstHalfGoals === secondHalfGoals;
      }
    }

    // ── HT/FT  (htft-hh = HT home / FT home, htft-da = HT draw / FT away) ─
    else if (/^htft-([hda])([hda])$/.test(s)) {
      const m = s.match(/^htft-([hda])([hda])$/)!;
      const htPart = m[1]!;
      const ftPart = m[2]!;
      const htOk =
        htPart === "h" ? htH > htA :
        htPart === "a" ? htA > htH :
        htH === htA;
      const ftOk =
        ftPart === "h" ? home > away :
        ftPart === "a" ? away > home :
        home === away;
      winning = htOk && ftOk;
    }

    // ── 2nd Half Result ─────────────────────────────────────────────────────
    else if (s === "2h-home") {
      if (h2H !== null && h2A !== null) winning = h2H > h2A;
    } else if (s === "2h-draw") {
      if (h2H !== null && h2A !== null) winning = h2H === h2A;
    } else if (s === "2h-away") {
      if (h2H !== null && h2A !== null) winning = h2A > h2H;
    }

    // ── 2nd Half Goals O/U  (2h-o05g, 2h-u15g) ────────────────────────────
    else if (/^2h-([ou])(\d+)g$/.test(s)) {
      if (h2H !== null && h2A !== null) {
        const m = s.match(/^2h-([ou])(\d+)g$/)!;
        const line = decodeCompactLine(m[2]!);
        const total2h = h2H + h2A;
        if (total2h === line) voided = true;
        else winning = m[1] === "o" ? total2h > line : total2h < line;
      }
    }

    // ── 2nd Half Correct Score ──────────────────────────────────────────────
    else if (s.startsWith("h2cs-")) {
      if (h2H !== null && h2A !== null) {
        const parts = s.slice(5).split("-");
        if (parts.length === 2) {
          const h = parseInt(parts[0]!, 10);
          const a = parseInt(parts[1]!, 10);
          if (!isNaN(h) && !isNaN(a)) winning = h2H === h && h2A === a;
        }
      }
    }
  }

  if (voided) return "void";
  return winning === null ? null : winning ? "won" : "lost";
}

function normalizeTeamName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|cd|club|women|woman|feminino|femenino|ladies|reserves|reserve|ii|iii|u\d{2}|sub ?\d{2})\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeTeamName(raw: string): string[] {
  return normalizeTeamName(raw)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function teamNameMatchStrength(a: string, b: string): "none" | "fuzzy" | "exact" {
  const left = normalizeTeamName(a);
  const right = normalizeTeamName(b);
  if (!left || !right) return "none";
  if (left === right) return "exact";
  if (left.includes(right) || right.includes(left)) return "exact";
  const leftTokens = tokenizeTeamName(a);
  const rightTokens = tokenizeTeamName(b);
  if (leftTokens.length === 0 || rightTokens.length === 0) return "none";
  const overlap = rightTokens.filter((token) => leftTokens.includes(token)).length;
  const minNeeded = Math.min(2, Math.min(leftTokens.length, rightTokens.length));
  return overlap >= Math.max(1, minNeeded) ? "fuzzy" : "none";
}

function splitTeamsFromTitle(title: string): { home: string; away: string } | null {
  const raw = String(title ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+(?:vs|v|x|-|—|–)\s+/i);
  if (parts.length < 2) return null;
  const home = parts[0]!.trim();
  const away = parts.slice(1).join(" ").trim();
  if (!home || !away) return null;
  return { home, away };
}

function getSelectionTeams(sel: SelectionRecord): { home: string; away: string } | null {
  if (sel.homeTeam && sel.awayTeam) {
    return { home: sel.homeTeam, away: sel.awayTeam };
  }
  return splitTeamsFromTitle(sel.matchTitle ?? "");
}

/**
 * Find the settled result for a selection.
 * Priority: per-selection matchId -> bet-level matchId (singles only).
 */
export function findResult(
  sel: SelectionRecord,
  betMatchId: string,
  isSingle: boolean
): FinishedResult | null {
  // 1. Exact ID match (fastest path)
  if (sel.matchId) {
    const r = finishedMatchResults.get(sel.matchId);
    if (r) return r;
  }
  if (isSingle) {
    const r = finishedMatchResults.get(betMatchId);
    if (r) return r;
  }

  // 2. Fallback: search by team names captured on the ticket.
  const teams = getSelectionTeams(sel);
  if (teams) {
    const exactMatches: FinishedResult[] = [];
    const fuzzyMatches: FinishedResult[] = [];
    for (const result of finishedMatchResults.values()) {
      const homeStrength = teamNameMatchStrength(result.homeTeam, teams.home);
      const awayStrength = teamNameMatchStrength(result.awayTeam, teams.away);
      if (homeStrength === "exact" && awayStrength === "exact") {
        exactMatches.push(result);
        continue;
      }
      if (homeStrength !== "none" && awayStrength !== "none") {
        fuzzyMatches.push(result);
      }
    }
    if (exactMatches.length > 0) return exactMatches[exactMatches.length - 1] ?? null;
    if (fuzzyMatches.length > 0) return fuzzyMatches[fuzzyMatches.length - 1] ?? null;
  }

  return null;
}

export function findLiveResult(
  sel: SelectionRecord,
  betMatchId: string,
  isSingle: boolean
): LiveResult | null {
  if (sel.matchId) {
    const r = liveMatchState.get(sel.matchId);
    if (r) return r;
  }
  if (isSingle) {
    const r = liveMatchState.get(betMatchId);
    if (r) return r;
  }

  const teams = getSelectionTeams(sel);
  if (teams) {
    for (const result of liveMatchState.values()) {
      const homeStrength = teamNameMatchStrength(String((result as any).home ?? ""), teams.home);
      const awayStrength = teamNameMatchStrength(String((result as any).away ?? ""), teams.away);
      if (homeStrength !== "none" && awayStrength !== "none") return result;
    }
  }

  return null;
}

function liveDefinitiveOutcomeForSel(
  sel: SelectionRecord,
  score: {
    home: number;
    away: number;
    cornersTotal?: number;
    cardsTotal?: number;
    htScore?: [number, number] | null;
    status?: string;
    tennisSets?: Array<[number, number]>;
    basketballQuarters?: Array<[number, number]>;
    hockeyPeriods?: Array<[number, number]>;
  }
): "won" | "lost" | null {
  if (blocksLiveEarlySettlement(score.status)) return null;

  // Key normalizations — mirror scoreOutcomeForSel so tg-o25, tg-u25, etc. are handled
  const s = normalizeSettlementSelectionKey(String(sel.selection ?? ""));

  const home = score.home;
  const away = score.away;
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const total = home + away;
  const tennisSets = Array.isArray(score.tennisSets) ? score.tennisSets : [];
  const basketballQuarters = Array.isArray(score.basketballQuarters) ? score.basketballQuarters : [];
  const hockeyPeriods = Array.isArray(score.hockeyPeriods) ? score.hockeyPeriods : [];

  if (s === "bts-yes") return home > 0 && away > 0 ? "won" : null;
  if (s === "bts-no")  return home > 0 && away > 0 ? "lost" : null;

  if (/^set[123]-(home|away)$/.test(s) || /^vs[123][ha]$/.test(s)) {
    const setNum =
      s.startsWith("set") ? parseInt(s.slice(3, 4), 10)
      : parseInt(s.slice(2, 3), 10);
    const setScore = tennisSets[setNum - 1] ?? null;
    if (!setScore || !tennisSetFinished(setScore)) return null;
    const wantHome = s.endsWith("home") || s.endsWith("h");
    return wantHome ? (setScore[0] > setScore[1] ? "won" : "lost") : (setScore[1] > setScore[0] ? "won" : "lost");
  }

  if (/^sc([123])-(\d-\d)$/.test(s) || /^ses-(\d-\d)$/.test(s)) {
    const match = s.match(/^sc([123])-(\d-\d)$/) || s.match(/^ses-(\d-\d)$/);
    const setNum = s.startsWith("sc") ? Number(match?.[1] ?? 0) : tennisSets.length;
    const wanted = s.startsWith("sc") ? match?.[2] : match?.[1];
    const setScore = tennisSets[setNum - 1] ?? null;
    if (!wanted || !setScore || !tennisSetFinished(setScore)) return null;
    return `${setScore[0]}-${setScore[1]}` === wanted ? "won" : "lost";
  }

  const qWinner = s.match(/^q([1234])-(home|away)$/);
  if (qWinner) {
    const qNum = Number(qWinner[1]!);
    const q = basketballQuarters[qNum - 1] ?? null;
    if (!q) return null;
    if (q[0] === q[1]) return null;
    return qWinner[2] === "home" ? (q[0] > q[1] ? "won" : "lost") : (q[1] > q[0] ? "won" : "lost");
  }

  const hPeriod = s.match(/^p([123])-(home|draw|away)$/) || s.match(/^per([123])-(home|draw|away)$/);
  if (hPeriod) {
    const pNum = Number(hPeriod[1]!);
    const p = hockeyPeriods[pNum - 1] ?? null;
    if (!p) return null;
    const want = hPeriod[2]!;
    if (want === "draw") return p[0] === p[1] ? "won" : "lost";
    return want === "home" ? (p[0] > p[1] ? "won" : "lost") : (p[1] > p[0] ? "won" : "lost");
  }

  // Goals O/U — can settle mid-game as soon as threshold crossed (Over) or exceeded (Under→lost)
  const mOU = s.match(/^([ou])([\d.]+)$/);
  if (mOU) {
    const side = mOU[1]!;
    const line = decodeCompactLine(mOU[2]!);
    if (!Number.isFinite(line)) return null;
    if (side === "o") return total > line ? "won" : null;
    // Under goals: lost as soon as exceeded; won only at final whistle (scoreOutcomeForSel handles won)
    return total > line ? "lost" : null;
  }

  // Corners O/U — settle mid-game when live cornersTotal is available
  // Over: won as soon as threshold crossed; Under: lost as soon as exceeded
  const mCorner = s.match(/^([ou])c(\d+)$/);
  if (mCorner) {
    if (score.cornersTotal == null) return null;
    const line = decodeCompactLine(mCorner[2]!);
    if (!Number.isFinite(line)) return null;
    const side = mCorner[1]!;
    if (side === "o") return score.cornersTotal > line ? "won" : null;
    return score.cornersTotal > line ? "lost" : null;
  }

  // Cards O/U — settle mid-game when live cardsTotal is available
  const mCard = s.match(/^([ou])card(\d+)$/);
  if (mCard) {
    if (score.cardsTotal == null) return null;
    const line = decodeCompactLine(mCard[2]!);
    if (!Number.isFinite(line)) return null;
    const side = mCard[1]!;
    if (side === "o") return score.cardsTotal > line ? "won" : null;
    return score.cardsTotal > line ? "lost" : null;
  }

  // Home team goals O/U
  const mTgh = s.match(/^tgh-([ou])(\d+)$/);
  if (mTgh) {
    const side = mTgh[1]!;
    const line = decodeCompactLine(mTgh[2]!);
    if (!Number.isFinite(line)) return null;
    if (side === "o") return home > line ? "won" : null;
    return home > line ? "lost" : null;
  }

  // Away team goals O/U
  const mTga = s.match(/^tga-([ou])(\d+)$/);
  if (mTga) {
    const side = mTga[1]!;
    const line = decodeCompactLine(mTga[2]!);
    if (!Number.isFinite(line)) return null;
    if (side === "o") return away > line ? "won" : null;
    return away > line ? "lost" : null;
  }

  return null;
}

/**
 * Scan all pending bets and settle those whose matches have finished.
 * Won bets credit potentialWin to the user's balance atomically.
 */
export async function autoSettlePendingBets(opts?: { matchIds?: string[] }): Promise<void> {
  const cycleId = `cycle:${Date.now()}`;
  try {
    const pendingBets = await db
      .select()
      .from(betsTable)
      .where(eq(betsTable.status, "pending"));

    if (pendingBets.length === 0) return;

    const matchIdSet = Array.isArray(opts?.matchIds) && opts!.matchIds!.length > 0
      ? new Set(opts!.matchIds!.map((x) => String(x)))
      : null;

    const idsToEnsure = new Set<string>();
    for (const bet of pendingBets) {
      const selections = bet.selections as SelectionRecord[];
      if (!Array.isArray(selections) || selections.length === 0) continue;
      const isSingle = selections.length === 1;
      if (matchIdSet) {
        let touches = false;
        for (const sel of selections) {
          const mId = sel.matchId ?? (isSingle ? bet.matchId : undefined);
          if (mId && matchIdSet.has(mId)) { touches = true; break; }
        }
        if (!touches) continue;
      }
      for (const sel of selections) {
        const mId = sel.matchId ?? (isSingle ? bet.matchId : undefined);
        if (!mId) continue;
        if (finishedMatchResults.has(mId)) continue;
        idsToEnsure.add(mId);
      }
    }

    const ids = Array.from(idsToEnsure);
    for (let i = 0; i < ids.length; i += 12) {
      const chunk = ids.slice(i, i + 12);
      await Promise.allSettled(chunk.map((id) => ensureFinishedMatchResult(id)));
    }

    let settled = 0;

    for (const bet of pendingBets) {
      const locked = await acquireBetSettlementLock(bet.id, cycleId);
      if (!locked) continue;
      try {
        const selections = bet.selections as SelectionRecord[];
        if (!Array.isArray(selections) || selections.length === 0) continue;

        const isSingle = selections.length === 1;
        if (matchIdSet) {
          let touches = false;
          for (const sel of selections) {
            const mId = sel.matchId ?? (isSingle ? bet.matchId : undefined);
            if (mId && matchIdSet.has(mId)) { touches = true; break; }
          }
          if (!touches) continue;
        }

        let liveLostDetected = false;
        for (const sel of selections) {
          const live = findLiveResult(sel, bet.matchId, isSingle);
          const liveScore = buildLiveSettlementScore(live);
          const resolution = liveScore ? resolveLiveSelectionSettlement(sel, liveScore) : { outcome: null as SettlementOutcome };
          if (resolution.outcome === "lost") { liveLostDetected = true; break; }
        }

        if (liveLostDetected) {
          const updatedSelsLost = selections.map(sel => {
            const live = findLiveResult(sel, bet.matchId, isSingle);
            const liveScore = buildLiveSettlementScore(live);
            const resolution = liveScore ? resolveLiveSelectionSettlement(sel, liveScore) : { outcome: null as SettlementOutcome, pendingReason: "missing_live_score" };
            if (!resolution.outcome) {
              return {
                ...sel,
                pendingReason: resolution.pendingReason ?? sel.pendingReason,
              };
            }
            return {
              ...sel,
              finalScore: { home: liveScore.home, away: liveScore.away },
              outcome: resolution.outcome,
              pendingReason: resolution.pendingReason,
            };
          });

          await db.transaction(async (tx) => {
            const canProceed = await ensureSettlementTransitionIdempotency(tx, {
              betId: bet.id,
              trigger: "live_losing_leg",
              oldStatus: "pending",
              newStatus: "lost",
              matchId: bet.matchId,
            });
            if (!canProceed) return;

            const rows = await tx
              .update(betsTable)
              .set({ status: "lost", selections: updatedSelsLost })
              .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
              .returning({ id: betsTable.id });
            if (rows.length === 0) return;

            await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

            await tx.insert(settlementLogsTable).values({
              settlementKey: buildSettlementLogKey({
                betId: bet.id,
                oldStatus: "pending",
                newStatus: "lost",
                event: "live_losing_leg",
                matchId: bet.matchId,
              }),
              betId: bet.id,
              userId: bet.userId,
              oldStatus: "pending",
              newStatus: "lost",
              payout: "0.00",
              message: "Auto-settled: losing leg resolved in-play",
            }).onConflictDoNothing();
          });

          settled++;
          continue;
        }

        if (isSingle) {
          const sel = selections[0]!;
          const live = findLiveResult(sel, bet.matchId, true);
          const liveScore = buildLiveSettlementScore(live);
          const resolution = liveScore ? resolveLiveSelectionSettlement(sel, liveScore) : { outcome: null as SettlementOutcome, pendingReason: "missing_live_score" };
          const out = resolution.outcome;
          if (liveScore && (out === "won" || out === "lost")) {
            const updatedSel: SelectionRecord = {
              ...sel,
              finalScore: { home: liveScore.home, away: liveScore.away },
              outcome: out,
              pendingReason: resolution.pendingReason,
            };

            if (out === "won") {
              const stakeNum = parseFloat(bet.stake);
              const effectiveOdds = Math.max(1.01, Number(sel.odd ?? 1));
              const payoutNum = Math.max(0, Number((stakeNum * effectiveOdds).toFixed(2)));
              const payoutStr = payoutNum.toFixed(2);
              const oddsStr = Number(effectiveOdds.toFixed(2)).toFixed(2);

              await db.transaction(async (tx) => {
                const canProceed = await ensureSettlementTransitionIdempotency(tx, {
                  betId: bet.id,
                  trigger: "live_single_win",
                  oldStatus: "pending",
                  newStatus: "won",
                  matchId: bet.matchId,
                });
                if (!canProceed) return;

                const rows = await tx
                  .update(betsTable)
                  .set({ status: "won", selections: [updatedSel], potentialWin: payoutStr, totalOdds: oddsStr })
                  .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
                  .returning({ id: betsTable.id });
                if (rows.length === 0) return;

                await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

                await applyBalanceDelta(tx, {
                  userId: bet.userId,
                  amount: payoutStr,
                  kind: "bet_settlement_early_payout",
                  idempotencyKey: `bet:${bet.id}:settlement:payout`,
                  refType: "bet",
                  refId: String(bet.id),
                  metadata: { trigger: "live_market_resolution", market: sel.selection },
                });

                await tx.insert(settlementLogsTable).values({
                  settlementKey: buildSettlementLogKey({
                    betId: bet.id,
                    oldStatus: "pending",
                    newStatus: "won",
                    event: "live_single_win",
                    matchId: bet.matchId,
                  }),
                  betId: bet.id,
                  userId: bet.userId,
                  oldStatus: "pending",
                  newStatus: "won",
                  payout: payoutStr,
                  message: "Auto-settled early: market resolved in-play",
                }).onConflictDoNothing();
              });

              settled++;
              continue;
            }

            await db.transaction(async (tx) => {
              const canProceed = await ensureSettlementTransitionIdempotency(tx, {
                betId: bet.id,
                trigger: "live_single_lost",
                oldStatus: "pending",
                newStatus: "lost",
                matchId: bet.matchId,
              });
              if (!canProceed) return;

              const rows = await tx
                .update(betsTable)
                .set({ status: "lost", selections: [updatedSel] })
                .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
                .returning({ id: betsTable.id });
              if (rows.length === 0) return;

              await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

              await tx.insert(settlementLogsTable).values({
                settlementKey: buildSettlementLogKey({
                  betId: bet.id,
                  oldStatus: "pending",
                  newStatus: "lost",
                  event: "live_single_lost",
                  matchId: bet.matchId,
                }),
                betId: bet.id,
                userId: bet.userId,
                oldStatus: "pending",
                newStatus: "lost",
                payout: "0.00",
                message: "Auto-settled early: market resolved in-play",
              }).onConflictDoNothing();
            });

            settled++;
            continue;
          }
        }

        const outcomes: SettlementOutcome[] = [];

        for (const sel of selections) {
          const result = findResult(sel, bet.matchId, isSingle);
          if (!result) {
            outcomes.push(null);
            continue;
          }

          const ht: HTScore | undefined =
            typeof result.htHome === "number" && typeof result.htAway === "number"
              ? { htHome: result.htHome, htAway: result.htAway }
              : undefined;

          const resolution = resolveSelectionSettlement(sel, result, ht, {
            status: (result as any).status,
            cornersTotal: result.cornersTotal,
            cardsTotal: result.cardsTotal,
            firstGoal: result.firstGoal,
            extras: result.extras,
            finishedAt: result.finishedAt,
          });
          outcomes.push(resolution.outcome);
        }

        // ── Early loss: if any leg is definitively lost, settle immediately ──
        if (outcomes.some(o => o === "lost")) {
          const updatedSelsLost = selections.map(sel => {
            const r = findResult(sel, bet.matchId, isSingle);
            if (!r) return sel;
            const ht = typeof r.htHome === "number" && typeof r.htAway === "number"
              ? { htHome: r.htHome, htAway: r.htAway }
              : undefined;
            const resolution = resolveSelectionSettlement(sel, { home: r.home, away: r.away }, ht, {
              status: (r as any).status,
              cornersTotal: r.cornersTotal,
              cardsTotal: r.cardsTotal,
              firstGoal: r.firstGoal,
              extras: r.extras,
              finishedAt: r.finishedAt,
            });
            return {
              ...sel,
              finalScore: { home: r.home, away: r.away },
              htScore: ht,
              outcome: resolution.outcome,
              pendingReason: resolution.pendingReason,
            };
          });
          await db.transaction(async (tx: any) => {
            const canProceed = await ensureSettlementTransitionIdempotency(tx, {
              betId: bet.id,
              trigger: "early_lost_detected",
              oldStatus: "pending",
              newStatus: "lost",
              matchId: bet.matchId,
            });
            if (!canProceed) return;

            const rows = await tx
              .update(betsTable)
              .set({ status: "lost", selections: updatedSelsLost })
              .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
              .returning({ id: betsTable.id });
            if (rows.length === 0) return;
            await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));
            await tx.insert(settlementLogsTable).values({
              settlementKey: buildSettlementLogKey({
                betId: bet.id,
                oldStatus: "pending",
                newStatus: "lost",
                event: "early_lost_detected",
                matchId: bet.matchId,
              }),
              betId: bet.id,
              userId: bet.userId,
              oldStatus: "pending",
              newStatus: "lost",
              payout: "0.00",
              message: "Auto-settled: losing leg detected",
            }).onConflictDoNothing();
          });
          logger.info(
            { betId: bet.id, userId: bet.userId, status: "lost" },
            "Bet auto-settled (early loss — leg failed)"
          );
          settled++;
          continue;
        }

        // Only settle when every selection has a resolved outcome (no nulls)
        if (outcomes.some(o => o === null)) continue;

        if (outcomes.every(o => o === "void")) {
          await db.transaction(async (tx: any) => {
            const canProceed = await ensureSettlementTransitionIdempotency(tx, {
              betId: bet.id,
              trigger: "all_void_refund",
              oldStatus: "pending",
              newStatus: "voided",
              matchId: bet.matchId,
            });
            if (!canProceed) return;

            const rows = await tx
              .update(betsTable)
              .set({ status: "voided" })
              .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
              .returning({ id: betsTable.id });
            if (rows.length === 0) return;
            await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

            await applyBalanceDelta(tx, {
              userId: bet.userId,
              amount: bet.stake,
              kind: "bet_settlement_void_refund",
              idempotencyKey: `bet:${bet.id}:settlement:void_refund`,
              refType: "bet",
              refId: String(bet.id),
            });

            await tx.insert(settlementLogsTable).values({
              settlementKey: buildSettlementLogKey({
                betId: bet.id,
                oldStatus: "pending",
                newStatus: "voided",
                event: "all_void_refund",
                matchId: bet.matchId,
              }),
              betId: bet.id,
              userId: bet.userId,
              oldStatus: "pending",
              newStatus: "voided",
              payout: bet.stake,
              message: "Auto-settled: all selections voided — stake refunded",
            }).onConflictDoNothing();
          });
          settled++;
          continue;
        }

        // All outcomes resolved and none is "lost" → won (void legs ignored)
        const newStatus = "won";

        const stakeNum = parseFloat(bet.stake);
        const effectiveOdds = computeResolvedTicketOdds(selections, outcomes);
        const payoutNum = Math.max(0, Number((stakeNum * effectiveOdds).toFixed(2)));
        const payoutStr = payoutNum.toFixed(2);
        const oddsStr = Number(effectiveOdds.toFixed(2)).toFixed(2);

        const updatedSelsWon = selections.map(sel => {
          const r = findResult(sel, bet.matchId, isSingle);
          if (!r) return sel;
          const ht = typeof r.htHome === "number" && typeof r.htAway === "number"
            ? { htHome: r.htHome, htAway: r.htAway }
            : undefined;
          const resolution = resolveSelectionSettlement(sel, { home: r.home, away: r.away }, ht, {
            status: (r as any).status,
            cornersTotal: r.cornersTotal,
            cardsTotal: r.cardsTotal,
            firstGoal: r.firstGoal,
            extras: r.extras,
            finishedAt: r.finishedAt,
          });
          return {
            ...sel,
            finalScore: { home: r.home, away: r.away },
            htScore: ht,
            outcome: resolution.outcome,
            pendingReason: resolution.pendingReason,
          };
        });

        await db.transaction(async (tx: any) => {
          const canProceed = await ensureSettlementTransitionIdempotency(tx, {
            betId: bet.id,
            trigger: "won_final",
            oldStatus: "pending",
            newStatus: newStatus,
            matchId: bet.matchId,
          });
          if (!canProceed) return;

          // Optimistic lock: only update if still pending
          const rows = await tx
            .update(betsTable)
            .set({ status: newStatus, selections: updatedSelsWon, potentialWin: payoutStr, totalOdds: oddsStr })
            .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
            .returning({ id: betsTable.id });

          if (rows.length === 0) return; // already settled elsewhere
          await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

          await applyBalanceDelta(tx, {
            userId: bet.userId,
            amount: payoutStr,
            kind: "bet_settlement_payout",
            idempotencyKey: `bet:${bet.id}:settlement:payout`,
            refType: "bet",
            refId: String(bet.id),
          });

          await tx.insert(settlementLogsTable).values({
            settlementKey: buildSettlementLogKey({
              betId: bet.id,
              oldStatus: "pending",
              newStatus: "won",
              event: "won_final",
              matchId: bet.matchId,
            }),
            betId: bet.id,
            userId: bet.userId,
            oldStatus: "pending",
            newStatus: "won",
            payout: payoutStr,
            message: `Auto-settled: settled with ${outcomes.filter(o => o === "void").length} void leg(s), ${outcomes.filter(o => o === "half_won").length} half-won leg(s) and ${outcomes.filter(o => o === "half_lost").length} half-lost leg(s)`,
          }).onConflictDoNothing();
        });

        logger.info(
          { betId: bet.id, userId: bet.userId, status: newStatus, potentialWin: bet.potentialWin },
          "Bet auto-settled"
        );
        settled++;
      } catch (err) {
        logger.error({ err, betId: bet.id }, "Error auto-settling bet");
      } finally {
        await releaseBetSettlementLock(bet.id, cycleId);
      }
    }

    if (settled > 0) {
      logger.info({ settled }, "Auto-settlement cycle complete");
    }
  } catch (err) {
    logger.error({ err }, "Auto-settlement worker error");
  }
}

export async function regradeSettledBetsForMatch(matchId: string, jobId: string): Promise<void> {
  const mId = String(matchId ?? "").trim();
  const jId = String(jobId ?? "").trim();
  if (!mId || !jId) return;

  try {
    const settledBets = await db
      .select()
      .from(betsTable)
      .where(and(
        sql`${betsTable.status} <> 'pending'`,
        sql`${betsTable.status} <> 'cashed_out'`,
        sql`(${betsTable.matchId} = ${mId} OR EXISTS (SELECT 1 FROM jsonb_array_elements(${betsTable.selections}) AS elem WHERE elem->>'matchId' = ${mId}))`,
      ));

    if (settledBets.length === 0) return;

    const idsToEnsure = new Set<string>();
    for (const bet of settledBets) {
      const selections = bet.selections as SelectionRecord[];
      if (!Array.isArray(selections) || selections.length === 0) continue;
      const isSingle = selections.length === 1;
      for (const sel of selections) {
        const selMatchId = sel.matchId ?? (isSingle ? bet.matchId : undefined);
        if (!selMatchId) continue;
        if (finishedMatchResults.has(selMatchId)) continue;
        idsToEnsure.add(selMatchId);
      }
    }

    const ids = Array.from(idsToEnsure);
    for (let i = 0; i < ids.length; i += 12) {
      const chunk = ids.slice(i, i + 12);
      await Promise.allSettled(chunk.map((id) => ensureFinishedMatchResult(id)));
    }

    let regraded = 0;

    for (const bet of settledBets) {
      try {
        const selections = bet.selections as SelectionRecord[];
        if (!Array.isArray(selections) || selections.length === 0) continue;

        const isSingle = selections.length === 1;

        const outcomes: SettlementOutcome[] = [];
        const updatedSelections = selections.map((sel) => {
          const result = findResult(sel, bet.matchId, isSingle);
          if (!result) {
            outcomes.push(null);
            return sel;
          }

          const ht: HTScore | undefined =
            typeof result.htHome === "number" && typeof result.htAway === "number"
              ? { htHome: result.htHome, htAway: result.htAway }
              : undefined;

          const resolution = resolveSelectionSettlement(sel, result, ht, {
            status: (result as any).status,
            cornersTotal: result.cornersTotal,
            cardsTotal: result.cardsTotal,
            firstGoal: result.firstGoal,
            extras: result.extras,
            finishedAt: result.finishedAt,
          });
          outcomes.push(resolution.outcome);

          return {
            ...sel,
            finalScore: { home: result.home, away: result.away },
            htScore: ht,
            outcome: resolution.outcome,
            pendingReason: resolution.pendingReason,
          };
        });

        if (outcomes.some((o) => o === null)) continue;

        const oldStatus = String(bet.status ?? "");

        let newStatus: "won" | "lost" | "voided";
        let payoutStr: string;
        let oddsStr: string | null = null;

        const stakeNum = parseFloat(bet.stake);
        const stakeStr = Number.isFinite(stakeNum) ? Number(stakeNum.toFixed(2)).toFixed(2) : "0.00";

        if (outcomes.some((o) => o === "lost")) {
          newStatus = "lost";
          payoutStr = "0.00";
        } else if (outcomes.every((o) => o === "void")) {
          newStatus = "voided";
          payoutStr = stakeStr;
        } else {
          newStatus = "won";

          const effectiveOdds = computeResolvedTicketOdds(selections, outcomes);

          const payoutNum = Math.max(0, Number((stakeNum * effectiveOdds).toFixed(2)));
          payoutStr = payoutNum.toFixed(2);
          oddsStr = Number(effectiveOdds.toFixed(2)).toFixed(2);
        }

        const oldCreditStr =
          oldStatus === "won"
            ? Number(parseFloat(bet.potentialWin).toFixed(2)).toFixed(2)
            : oldStatus === "voided"
              ? stakeStr
              : "0.00";

        const deltaNum = Number((parseFloat(payoutStr) - parseFloat(oldCreditStr)).toFixed(2));
        const deltaStr = deltaNum.toFixed(2);

        const statusChanged = newStatus !== oldStatus;
        const payoutChanged = newStatus === "won" && oldStatus === "won" && payoutStr !== oldCreditStr;
        const selectionsChanged = JSON.stringify(updatedSelections) !== JSON.stringify(selections);

        if (!statusChanged && !payoutChanged && !selectionsChanged) continue;

        await db.transaction(async (tx) => {
          const canProceed = await ensureSettlementTransitionIdempotency(tx, {
            betId: bet.id,
            trigger: "regrade_delta",
            oldStatus,
            newStatus,
            matchId: mId,
            jobId: jId,
          });
          if (!canProceed) return;

          const set: Partial<Record<keyof typeof betsTable.$inferSelect, unknown>> = {
            selections: updatedSelections,
          };

          if (statusChanged || payoutChanged) {
            set.status = newStatus;
            if (newStatus === "won") {
              set.potentialWin = payoutStr;
              set.totalOdds = oddsStr!;
            }
          }

          const rows = await tx
            .update(betsTable)
            .set(set as never)
            .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, oldStatus)))
            .returning({ id: betsTable.id });

          if (rows.length === 0) return;

          await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

          if (deltaNum !== 0) {
            const applied = await applyBalanceDelta(tx, {
              userId: bet.userId,
              amount: deltaStr,
              kind: "bet_regrade_delta",
              idempotencyKey: `bet:${bet.id}:regrade:${jId}:delta`,
              refType: "bet",
              refId: String(bet.id),
              metadata: {
                matchId: mId,
                jobId: jId,
                oldStatus,
                newStatus,
                oldPayout: oldCreditStr,
                newPayout: payoutStr,
              },
            });

            if (!applied) return;

            await tx.insert(settlementLogsTable).values({
              settlementKey: buildSettlementLogKey({
                betId: bet.id,
                oldStatus,
                newStatus,
                event: "regrade_delta",
                matchId: mId,
                jobId: jId,
              }),
              betId: bet.id,
              userId: bet.userId,
              oldStatus,
              newStatus,
              payout: payoutStr,
              message: `Regrade: match ${mId} corrected (job ${jId})`,
            }).onConflictDoNothing();
          }
        });

        if (deltaNum !== 0) regraded++;
      } catch (err) {
        logger.error({ err, betId: bet.id, matchId: mId, jobId: jId }, "Error regrading bet");
      }
    }

    if (regraded > 0) {
      logger.warn({ matchId: mId, jobId: jId, regraded }, "Regrade applied (settled bets adjusted)");
    }
  } catch (err) {
    logger.error({ err, matchId: mId, jobId: jId }, "Regrade cycle error");
  }
}

async function hydrateSettledBetSelections(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const lostBets = await db
      .select({
        id: betsTable.id,
        matchId: betsTable.matchId,
        selections: betsTable.selections,
        createdAt: betsTable.createdAt,
      })
      .from(betsTable)
      .where(and(eq(betsTable.status, "lost"), gte(betsTable.createdAt, cutoff)))
      .orderBy(desc(betsTable.createdAt))
      .limit(200);

    if (lostBets.length === 0) return;

    for (const bet of lostBets) {
      const selections = bet.selections as SelectionRecord[];
      if (!Array.isArray(selections) || selections.length === 0) continue;

      const isSingle = selections.length === 1;
      let changed = false;

        const next = selections.map((sel) => {
        const r = findResult(sel, bet.matchId, isSingle);
        if (!r) return sel;

        const needsOutcome = sel.outcome == null;
        const needsScore = sel.finalScore == null;
        if (!needsOutcome && !needsScore) return sel;

        const ht = typeof r.htHome === "number" && typeof r.htAway === "number"
          ? { htHome: r.htHome, htAway: r.htAway }
          : undefined;

        changed = true;
          const resolution = resolveSelectionSettlement(sel, { home: r.home, away: r.away }, ht, {
            status: (r as any).status,
            cornersTotal: r.cornersTotal,
            cardsTotal: r.cardsTotal,
            firstGoal: r.firstGoal,
            extras: r.extras,
            finishedAt: r.finishedAt,
          });
          return {
          ...sel,
          finalScore: needsScore ? { home: r.home, away: r.away } : sel.finalScore,
          htScore: sel.htScore ?? ht,
          outcome: needsOutcome
            ? resolution.outcome
            : sel.outcome,
            pendingReason: resolution.pendingReason,
        };
      });

      if (!changed) continue;

      await db
        .update(betsTable)
        .set({ selections: next })
        .where(eq(betsTable.id, bet.id));
    }
  } catch (err) {
    logger.error({ err }, "Hydrate settled bet selections error");
  }
}

/**
 * Void and refund any pending bets older than STALE_THRESHOLD_MS where no
 * match result has been found. This prevents bets from staying pending forever
 * if data was never received (API outage, server restart, cancelled match, etc.).
 *
 * Status is set to "voided". Stake is refunded to user balance.
 */
const STALE_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours

async function expireStalePendingBets(): Promise<void> {
  const cycleId = `stale:${Date.now()}`;
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - STALE_THRESHOLD_MS);

    // Find bets where kickoff_time < cutoff OR (no kickoff_time AND created_at < cutoff)
    const staleBets = await db
      .select()
      .from(betsTable)
      .where(and(
        eq(betsTable.status, "pending"),
        sql`COALESCE(${betsTable.kickoffTime}, ${betsTable.createdAt}) < ${cutoff}`
      ));

    if (staleBets.length === 0) return;

    for (const bet of staleBets) {
      const locked = await acquireBetSettlementLock(bet.id, cycleId);
      if (!locked) continue;
      try {
        // One last attempt to find the result before voiding
        const selections = bet.selections as SelectionRecord[];
        const isSingle = Array.isArray(selections) && selections.length === 1;
        const hasResult = Array.isArray(selections) && selections.some(sel => {
          if (sel.matchId && finishedMatchResults.has(sel.matchId)) return true;
          if (isSingle && finishedMatchResults.has(bet.matchId)) return true;
          return false;
        });

        // If result just became available, skip — next settlement cycle handles it
        if (hasResult) continue;

        await db.transaction(async (tx: any) => {
          const canProceed = await ensureSettlementTransitionIdempotency(tx, {
            betId: bet.id,
            trigger: "stale_refund",
            oldStatus: "pending",
            newStatus: "voided",
            matchId: bet.matchId,
          });
          if (!canProceed) return;

          const rows = await tx
            .update(betsTable)
            .set({ status: "voided" })
            .where(and(eq(betsTable.id, bet.id), eq(betsTable.status, "pending")))
            .returning({ id: betsTable.id });

          if (rows.length === 0) return; // already settled elsewhere
          await tx.delete(cashoutStatesTable).where(eq(cashoutStatesTable.betId, bet.id));

          await applyBalanceDelta(tx, {
            userId: bet.userId,
            amount: bet.stake,
            kind: "bet_settlement_stale_refund",
            idempotencyKey: `bet:${bet.id}:settlement:stale_refund`,
            refType: "bet",
            refId: String(bet.id),
          });

          await tx.insert(settlementLogsTable).values({
            settlementKey: buildSettlementLogKey({
              betId: bet.id,
              oldStatus: "pending",
              newStatus: "voided",
              event: "stale_refund",
              matchId: bet.matchId,
            }),
            betId: bet.id,
            userId: bet.userId,
            oldStatus: "pending",
            newStatus: "voided",
            payout: bet.stake,
            message: "Stale bet voided after 72h — stake refunded",
          }).onConflictDoNothing();
        });

        logger.warn(
          { betId: bet.id, userId: bet.userId, stake: bet.stake, createdAt: bet.createdAt, matchId: bet.matchId },
          "Stale bet voided — pending >72 h without result, stake refunded"
        );
      } catch (err) {
        logger.error({ err, betId: bet.id }, "Error voiding stale bet");
      } finally {
        await releaseBetSettlementLock(bet.id, cycleId);
      }
    }
  } catch (err) {
    logger.error({ err }, "Error scanning for stale bets");
  }
}

/**
 * Start the background settlement worker.
 *
 * Each cycle (every ~60 s):
 *   1. scanDailyForFinished()       — football v1/v2 daily feed
 *   2. scanV2AllSportsForFinished() — V2 today feeds for ALL sports
 *   3. autoSettlePendingBets()      — settle bets with known results
 *   4. expireStalePendingBets()     — void bets pending >72 h (stake refunded)
 *
 * Uses self-scheduling setTimeout (not setInterval) so each cycle only starts
 * after the previous one completes — prevents overlap on slow DB/API cycles.
 * Fully independent of user sessions: runs server-side at all times.
 */
export function startSettlementWorker(): void {
  const parseMs = (raw: string | undefined, fallback: number, min: number, key: string): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min) {
      logger.error({ key, raw, fallback }, "Invalid worker interval env; using fallback");
      return fallback;
    }
    return n;
  };

  const rawIntervalMs = process.env.SETTLEMENT_INTERVAL_MS ?? "15000";
  const intervalMs = parseMs(rawIntervalMs, 15_000, 1_000, "SETTLEMENT_INTERVAL_MS");

  const rawInitialDelayMs = process.env.SETTLEMENT_INITIAL_DELAY_MS ?? "5000";
  const initialDelayMs = parseMs(rawInitialDelayMs, 5_000, 0, "SETTLEMENT_INITIAL_DELAY_MS");

  const queueEnabled = typeof process.env["REDIS_URL"] === "string" && process.env["REDIS_URL"]!.trim() !== "";
  const rawCatchupMs = process.env.SETTLEMENT_CATCHUP_INTERVAL_MS ?? "60000";
  const catchupMs = parseMs(rawCatchupMs, 60_000, 10_000, "SETTLEMENT_CATCHUP_INTERVAL_MS");
  let lastCatchupAt = 0;

  const run = async (): Promise<void> => {
    try {
      // Parallel scan: football daily feed + all V2 sports today feed
      await Promise.allSettled([
        scanDailyForFinished(),
        scanV2AllSportsForFinished(),
      ]);
      const now = Date.now();
      if (!queueEnabled || now - lastCatchupAt >= catchupMs) {
        await autoSettlePendingBets();
        lastCatchupAt = now;
      }
      // Enrich early-loss bets with per-leg scores/outcomes when remaining matches finish
      await hydrateSettledBetSelections();
      // Void and refund bets with no data after 72 h
      await expireStalePendingBets();
    } catch (err) {
      logger.error({ err }, "Settlement worker unhandled error");
    }
  };

  const schedule = (): void => {
    setTimeout(() => {
      void run().finally(schedule);
    }, intervalMs);
  };

  // First run shortly after startup, then self-schedule on interval
  setTimeout(() => {
    void run().finally(schedule);
  }, initialDelayMs);

  logger.info({ intervalMs, initialDelayMs, queueEnabled, catchupMs }, "Bet auto-settlement worker started (self-scheduling, all sports)");
}
