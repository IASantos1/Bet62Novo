import { logger } from "./logger.js";
import {
  buildLiveSettlementScore,
  findLiveResult,
  findResult,
  normalizeSettlementSelectionKey,
  resolveLiveSelectionSettlement,
  resolveSelectionSettlement,
  type FinishedResult,
  type HTScore,
  type LiveResult,
  type SelectionRecord,
  type SelectionSettlementResolution,
  type SettlementOutcome,
} from "../settlement.js";

export type SettlementReason =
  | "already_settled"
  | "no_result"
  | "incomplete_data"
  | "market_not_mapped"
  | "market_pending"
  | "invalid_context"
  | "status_pending"
  | "sport_not_identified"
  | "market_evaluated";

export type SettlementResult = {
  outcome: SettlementOutcome;
  reason: SettlementReason;
  reasonDetail?: string;
  normalizedKey: string;
  detectedSport: string;
  providerSport?: string;
  ruleVersion: string;
  resolutionSource?: SelectionSettlementResolution["resolutionSource"];
  settlementNote?: string | null;
  updatedSel: SelectionRecord;
  result: FinishedResult | LiveResult | null;
  auditInfo: {
    beforeOutcome: SettlementOutcome;
    inputSnapshot: Record<string, unknown>;
    outputSnapshot: Record<string, unknown>;
    timestamp: string;
    engineVersion: string;
    ruleVersion: string;
  };
};

const ENGINE_VERSION = "2025.06-v4";

const settlementStats: Record<string, {
  won: number;
  lost: number;
  voided: number;
  half_won: number;
  half_lost: number;
  pending: number;
  no_result: number;
  market_pending: number;
  market_not_mapped: number;
  incomplete_data: number;
  status_pending: number;
  invalid_context: number;
  already_settled: number;
  sport_not_identified: number;
}> = {};

const settlementFallbackMetrics: Record<
  "fallback_tennis_winner" | "fallback_baseball_moneyline" | "fallback_football_1x2",
  number
> = {
  fallback_tennis_winner: 0,
  fallback_baseball_moneyline: 0,
  fallback_football_1x2: 0,
};

export function resolveSelectionOutcome(
  sel: SelectionRecord,
  betMatchId: string | undefined,
  isLive = false,
  opts?: { forceReevaluate?: boolean },
): SettlementResult {
  const normalizedKey = normalizeSettlementSelectionKey(sel.selection);
  const providerSport = readProviderSport(sel);
  const beforeOutcome = sel.outcome ?? null;
  const detectedFromKey = detectSportFromKey(normalizedKey);

  if (!opts?.forceReevaluate && beforeOutcome && beforeOutcome !== null) {
    updateSettlementStats(normalizedKey, providerSport ?? detectedFromKey, beforeOutcome, "already_settled");
    return createAlreadySettledResult(sel, normalizedKey, providerSport, detectedFromKey);
  }

  const canUseBetMatchFallback = !sel.matchId && !!betMatchId;
  const result = isLive
    ? findLiveResult(sel, betMatchId ?? "", canUseBetMatchFallback)
    : findResult(sel, betMatchId ?? "", canUseBetMatchFallback);

  if (!result) {
    logUnknownSettlement(normalizedKey, providerSport, sel, "result_not_found");
    updateSettlementStats(normalizedKey, providerSport ?? detectedFromKey, null, "no_result");
    return createFailureResult(
      sel,
      "no_result",
      "Result not found in settlement cache",
      normalizedKey,
      providerSport,
      detectedFromKey,
    );
  }

  const detectedSport = providerSport || detectSportFallback(result, sel, normalizedKey) || "unknown";
  const ruleVersion = getRuleVersionForMarket(normalizedKey, detectedSport);

  if (isLive) {
    const liveScore = buildLiveSettlementScore(result as LiveResult);
    if (!liveScore) {
      updateSettlementStats(normalizedKey, detectedSport, null, "incomplete_data");
      return createFailureResult(
        sel,
        "incomplete_data",
        "Invalid live score payload from provider",
        normalizedKey,
        providerSport,
        detectedSport,
        ruleVersion,
        result,
      );
    }

    const resolution = resolveLiveSelectionSettlement(sel, liveScore);
    const reason = determineReason(resolution, normalizedKey, true, liveScore.status);
    const reasonDetail = getReasonDetail(reason, liveScore.status, normalizedKey, resolution.pendingReason ?? undefined);
    const { updatedSel, auditInfo } = buildSettlementOutput(sel, result, resolution, true, {
      beforeOutcome,
      normalizedKey,
      detectedSport,
      providerSport,
      ruleVersion,
      status: liveScore.status,
      homeScore: liveScore.home,
      awayScore: liveScore.away,
      htScore: liveScore.htScore,
    });

    updateSettlementStats(normalizedKey, detectedSport, resolution.outcome, reason);
    logStructuredSettlement({
      matchId: sel.matchId ?? betMatchId,
      selection: sel.selection,
      normalizedKey,
      detectedSport,
      providerSport,
      outcome: resolution.outcome,
      reason,
      ruleVersion,
      isLive,
      status: liveScore.status,
    });

    return {
      outcome: resolution.outcome,
      reason,
      reasonDetail,
      normalizedKey,
      detectedSport,
      providerSport: providerSport ?? undefined,
      ruleVersion,
      resolutionSource: resolution.resolutionSource,
      settlementNote: resolution.settlementNote ?? null,
      updatedSel,
      result,
      auditInfo,
    };
  }

  const finalContext = buildFinalContext(result as FinishedResult);
  if (!finalContext.isValid) {
    updateSettlementStats(normalizedKey, detectedSport, null, "incomplete_data");
    return createFailureResult(
      sel,
      "incomplete_data",
      "Invalid finished result payload from provider",
      normalizedKey,
      providerSport,
      detectedSport,
      ruleVersion,
      result,
    );
  }

  if (isMatchStillPending(finalContext.status)) {
    updateSettlementStats(normalizedKey, detectedSport, null, "status_pending");
    return createFailureResult(
      sel,
      "status_pending",
      `Match status still pending: ${finalContext.status || "unknown"}`,
      normalizedKey,
      providerSport,
      detectedSport,
      ruleVersion,
      result,
    );
  }

  const resolution = resolveSelectionSettlement(
    sel,
    { home: finalContext.homeScore, away: finalContext.awayScore },
    finalContext.ht,
    {
      ...finalContext.extra,
      providerSport: detectedSport,
      winner: finalContext.winner,
    },
  );
  const reason = determineReason(resolution, normalizedKey, false, finalContext.status);
  const reasonDetail = getReasonDetail(reason, finalContext.status, normalizedKey, resolution.pendingReason ?? undefined);
  const { updatedSel, auditInfo } = buildSettlementOutput(sel, result, resolution, false, {
    beforeOutcome,
    normalizedKey,
    detectedSport,
    providerSport,
    ruleVersion,
    status: finalContext.status,
    homeScore: finalContext.homeScore,
    awayScore: finalContext.awayScore,
    htScore: finalContext.ht ? [finalContext.ht.htHome, finalContext.ht.htAway] : undefined,
  });

  updateSettlementStats(normalizedKey, detectedSport, resolution.outcome, reason);
  updateFallbackMetrics(resolution.resolutionSource);
  logStructuredSettlement({
    matchId: sel.matchId ?? betMatchId,
    selection: sel.selection,
    normalizedKey,
    detectedSport,
    providerSport,
    outcome: resolution.outcome,
    reason,
    ruleVersion,
    isLive,
    status: finalContext.status,
  });

  return {
    outcome: resolution.outcome,
    reason,
    reasonDetail,
    normalizedKey,
    detectedSport,
    providerSport: providerSport ?? undefined,
    ruleVersion,
    resolutionSource: resolution.resolutionSource,
    settlementNote: resolution.settlementNote ?? null,
    updatedSel,
    result,
    auditInfo,
  };
}

export function getSettlementStats(): Record<string, unknown> {
  return {
    byMarket: settlementStats,
    fallbackMetrics: settlementFallbackMetrics,
  };
}

export function getSettlementFallbackMetrics(): Record<string, number> {
  return { ...settlementFallbackMetrics };
}

function buildSettlementOutput(
  sel: SelectionRecord,
  result: FinishedResult | LiveResult,
  resolution: SelectionSettlementResolution,
  isLive: boolean,
  context: {
    beforeOutcome: SettlementOutcome;
    normalizedKey: string;
    detectedSport: string;
    providerSport?: string | null;
    ruleVersion: string;
    status?: string;
    homeScore?: number;
    awayScore?: number;
    htScore?: [number, number] | null;
  },
): { updatedSel: SelectionRecord; auditInfo: SettlementResult["auditInfo"] } {
  const updatedSel = buildUpdatedSelection(sel, result, resolution, isLive);
  const auditInfo: SettlementResult["auditInfo"] = {
    beforeOutcome: context.beforeOutcome,
    inputSnapshot: {
      normalizedKey: context.normalizedKey,
      detectedSport: context.detectedSport,
      providerSport: context.providerSport ?? undefined,
      homeScore: context.homeScore,
      awayScore: context.awayScore,
      htScore: context.htScore ?? undefined,
      status: context.status,
      isLive,
    },
    outputSnapshot: {
      outcome: resolution.outcome,
      pendingReason: resolution.pendingReason,
      finalScore: updatedSel.finalScore,
      htScore: updatedSel.htScore,
      settlementNote: resolution.settlementNote ?? null,
      resolutionSource: resolution.resolutionSource ?? null,
    },
    timestamp: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    ruleVersion: context.ruleVersion,
  };
  return { updatedSel, auditInfo };
}

function buildUpdatedSelection(
  sel: SelectionRecord,
  result: FinishedResult | LiveResult,
  resolution: SelectionSettlementResolution,
  isLive: boolean,
): SelectionRecord {
  const now = new Date().toISOString();
  if (isLive) {
    const liveScore = buildLiveSettlementScore(result as LiveResult);
    return {
      ...sel,
      ...(liveScore ? { finalScore: { home: liveScore.home, away: liveScore.away } } : {}),
      ...(resolution.outcome !== null ? { outcome: resolution.outcome } : {}),
      ...(resolution.outcome !== null ? { pendingReason: null } : resolution.pendingReason ? { pendingReason: resolution.pendingReason } : {}),
      ...(resolution.outcome !== null ? { settlementNote: null } : {}),
      lastSettledAt: now,
      settlementRuleVersion: ENGINE_VERSION,
    };
  }

  const finished = result as FinishedResult;
  const ht =
    typeof finished.htHome === "number" && typeof finished.htAway === "number"
      ? { htHome: finished.htHome, htAway: finished.htAway }
      : undefined;

  return {
    ...sel,
    ...(typeof finished.home === "number" && typeof finished.away === "number"
      ? { finalScore: { home: finished.home, away: finished.away } }
      : {}),
    ...(ht ? { htScore: ht } : {}),
    ...(resolution.outcome !== null ? { outcome: resolution.outcome } : {}),
    ...(resolution.outcome !== null ? { pendingReason: null } : resolution.pendingReason ? { pendingReason: resolution.pendingReason } : {}),
    ...(resolution.outcome !== null ? { settlementNote: null } : {}),
    lastSettledAt: now,
    settlementRuleVersion: ENGINE_VERSION,
  };
}

function createAlreadySettledResult(
  sel: SelectionRecord,
  normalizedKey: string,
  providerSport: string | null,
  detectedSport: string,
): SettlementResult {
  const ruleVersion = getRuleVersionForMarket(normalizedKey, providerSport || detectedSport);
  return {
    outcome: sel.outcome ?? null,
    reason: "already_settled",
    reasonDetail: "Selection already had a terminal outcome",
    normalizedKey,
    detectedSport,
    providerSport: providerSport ?? undefined,
    ruleVersion,
    updatedSel: {
      ...sel,
      lastSettledAt: new Date().toISOString(),
      settlementRuleVersion: ENGINE_VERSION,
    },
    result: null,
    auditInfo: {
      beforeOutcome: sel.outcome ?? null,
      inputSnapshot: { selection: sel.selection, normalizedKey },
      outputSnapshot: { outcome: sel.outcome ?? null },
      timestamp: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      ruleVersion,
    },
  };
}

function createFailureResult(
  sel: SelectionRecord,
  reason: Exclude<SettlementReason, "already_settled" | "market_evaluated">,
  reasonDetail: string,
  normalizedKey: string,
  providerSport: string | null,
  detectedSport: string,
  ruleVersion = getRuleVersionForMarket(normalizedKey, providerSport || detectedSport),
  result: FinishedResult | LiveResult | null = null,
): SettlementResult {
  return {
    outcome: null,
    reason,
    reasonDetail,
    normalizedKey,
    detectedSport,
    providerSport: providerSport ?? undefined,
    ruleVersion,
    updatedSel: {
      ...sel,
      pendingReason: reason,
      lastSettledAt: new Date().toISOString(),
      settlementRuleVersion: ENGINE_VERSION,
    },
    result,
    auditInfo: {
      beforeOutcome: sel.outcome ?? null,
      inputSnapshot: { selection: sel.selection, normalizedKey },
      outputSnapshot: { outcome: null, reason, reasonDetail },
      timestamp: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      ruleVersion,
    },
  };
}

function updateSettlementStats(
  key: string,
  sport: string,
  outcome: SettlementOutcome,
  reason: SettlementReason,
): void {
  const marketKey = `${sport}:${key}`;
  if (!settlementStats[marketKey]) {
    settlementStats[marketKey] = {
      won: 0,
      lost: 0,
      voided: 0,
      half_won: 0,
      half_lost: 0,
      pending: 0,
      no_result: 0,
      market_pending: 0,
      market_not_mapped: 0,
      incomplete_data: 0,
      status_pending: 0,
      invalid_context: 0,
      already_settled: 0,
      sport_not_identified: 0,
    };
  }

  const stats = settlementStats[marketKey];
  if (outcome === "won") stats.won++;
  else if (outcome === "lost") stats.lost++;
  else if (outcome === "void") stats.voided++;
  else if (outcome === "half_won") stats.half_won++;
  else if (outcome === "half_lost") stats.half_lost++;
  else stats.pending++;

  if (reason !== "market_evaluated" && reason in stats) {
    stats[reason]++;
  }
}

function updateFallbackMetrics(source: SelectionSettlementResolution["resolutionSource"] | undefined): void {
  if (!source) return;
  if (source in settlementFallbackMetrics) {
    settlementFallbackMetrics[source as keyof typeof settlementFallbackMetrics]++;
  }
}

function getRuleVersionForMarket(normalizedKey: string, sport: string): string {
  return `${sport}:${normalizedKey}:${ENGINE_VERSION}`;
}

function detectSportFallback(result: FinishedResult | LiveResult, sel: SelectionRecord, normalizedKey: string): string {
  const title = String((result as any)?.title || sel.matchTitle || sel.selection || "").toLowerCase();
  if (detectSportFromKey(normalizedKey) !== "football") return detectSportFromKey(normalizedKey);
  if (/tennis|set|game/.test(title) || /set\d/.test(sel.selection || "")) return "tennis";
  if (/basket|quarter|q[1-4]/.test(title)) return "basketball";
  if (/hockey|period|p[1-3]/.test(title)) return "hockey";
  if (/baseball|inning|mlb|f5/.test(title)) return "baseball";
  return "football";
}

function detectSportFromKey(normalizedKey: string): string {
  const s = normalizedKey;
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

function determineReason(
  resolution: SelectionSettlementResolution,
  normalizedKey: string,
  isLive: boolean,
  status?: string,
): SettlementReason {
  if (resolution.outcome !== null) return "market_evaluated";
  if (resolution.pendingReason === "status_delayed_window") return "status_pending";
  if (!resolution.pendingReason && !isLive && isMatchStillPending(status)) return "status_pending";
  if (!normalizedKey) return "market_not_mapped";
  return "market_pending";
}

function getReasonDetail(
  reason: SettlementReason,
  status: string | undefined,
  normalizedKey: string,
  pendingReason?: string,
): string | undefined {
  if (reason === "market_evaluated") return undefined;
  if (reason === "status_pending") return `Match status still not settleable: ${status || "unknown"}`;
  if (pendingReason) return `${pendingReason} (${normalizedKey})`;
  return `${reason} (${normalizedKey})`;
}

function getSelectionSettlementNote(status: unknown, outcome: SettlementOutcome): string | undefined {
  if (outcome === "void") {
    const normalizedStatus = String(status ?? "").trim().toLowerCase();
    if (normalizedStatus.includes("cancel")) return "Void by cancelled event";
    if (normalizedStatus.includes("abandon")) return "Void by abandoned event";
    if (normalizedStatus.includes("suspend") || normalizedStatus.includes("delay")) return "Void by suspended event";
    return "Void settlement";
  }
  if (outcome === "half_won") return "Partial settlement: half won";
  if (outcome === "half_lost") return "Partial settlement: half lost";
  return undefined;
}

function buildFinalContext(result: FinishedResult): {
  isValid: boolean;
  homeScore: number;
  awayScore: number;
  ht?: HTScore;
  status?: string;
  winner: "home" | "away" | null;
  extra: {
    status?: string;
    cornersTotal?: number;
    cardsTotal?: number;
    firstGoal?: "home" | "away" | "none";
    extras?: unknown;
    finishedAt?: number;
  };
} {
  const homeScore = Number((result as any)?.home ?? Number.NaN);
  const awayScore = Number((result as any)?.away ?? Number.NaN);
  const ht =
    typeof (result as any)?.htHome === "number" && typeof (result as any)?.htAway === "number"
      ? { htHome: (result as any).htHome as number, htAway: (result as any).htAway as number }
      : undefined;
  const status = String((result as any)?.status ?? "");
  return {
    isValid: Number.isFinite(homeScore) && Number.isFinite(awayScore),
    homeScore,
    awayScore,
    ht,
    status,
    winner:
      homeScore > awayScore
        ? "home"
        : awayScore > homeScore
          ? "away"
          : null,
    extra: {
      status,
      cornersTotal: (result as any)?.cornersTotal,
      cardsTotal: (result as any)?.cardsTotal,
      firstGoal: (result as any)?.firstGoal,
      extras: (result as any)?.extras,
      finishedAt: (result as any)?.finishedAt,
    },
  };
}

function isMatchStillPending(status: string | undefined): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return false;
  return [
    "not started",
    "scheduled",
    "fixture",
    "in progress",
    "live",
    "1st half",
    "2nd half",
    "halftime",
    "break",
  ].some((token) => normalized.includes(token));
}

function readProviderSport(sel: SelectionRecord): string | null {
  const providerSport = (sel as { sport?: unknown; providerSport?: unknown }).providerSport
    ?? (sel as { sport?: unknown; providerSport?: unknown }).sport;
  return providerSport == null ? null : String(providerSport);
}

function logStructuredSettlement(args: {
  matchId?: string;
  selection: string;
  normalizedKey: string;
  detectedSport: string;
  providerSport?: string | null;
  outcome: SettlementOutcome;
  reason: SettlementReason;
  ruleVersion: string;
  isLive: boolean;
  status?: string;
}): void {
  logger.info(
    {
      settlement: {
        matchId: args.matchId,
        selection: args.selection,
        normalizedKey: args.normalizedKey,
        detectedSport: args.detectedSport,
        providerSport: args.providerSport ?? undefined,
        outcome: args.outcome,
        reason: args.reason,
        ruleVersion: args.ruleVersion,
        isLive: args.isLive,
        status: args.status,
      },
    },
    "Selection settlement resolved",
  );
}

function logUnknownSettlement(
  normalizedKey: string,
  providerSport: string | null,
  sel: SelectionRecord,
  issue: string,
): void {
  logger.warn(
    {
      settlement: {
        issue,
        normalizedKey,
        providerSport: providerSport ?? undefined,
        selection: sel.selection,
        market: sel.market,
        label: sel.label,
        matchId: sel.matchId,
      },
    },
    "Selection settlement unresolved",
  );
}
