import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  betsTable,
  cashoutStatesTable,
  eventAdminOverridesTable,
  platformSettingsTable,
  settlementLogsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, sql, and, inArray, asc } from "drizzle-orm";
import {
  authMiddleware,
  type AuthRequest,
  verifyAuthToken,
} from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { applyBalanceDelta, insertLedgerEntry } from "../lib/ledger.js";
import {
  liveMatchState,
  finishedMatchResults,
  type LiveMatchState,
} from "./matches.js";
import { scoreOutcomeForSel, type SelectionRecord } from "../settlement.js";

const router: IRouter = Router();

const MIN_STAKE = 0.1;
const MAX_STAKE = 2000.0;
const MIN_ODDS = 1.01;
const MAX_ODDS = 500.0;

router.post(
  "/quote",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    const now = Date.now();
    const raw = req.body as {
      selections?: Array<{
        matchId?: unknown;
        market?: unknown;
        selection?: unknown;
      }>;
    } | null;
    const selList = Array.isArray(raw?.selections) ? raw!.selections! : [];
    const out: Array<{
      matchId: string;
      market: string;
      odds: number | null;
      suspended: boolean;
      reason?: string;
    }> = [];

    for (const sel of selList) {
      const matchId = String(sel?.matchId ?? "");
      const market = String(sel?.market ?? "result");
      const selection =
        typeof sel?.selection === "string" && sel.selection.trim() !== ""
          ? sel.selection
          : market;
      if (!matchId) continue;

      if (finishedMatchResults.has(matchId)) {
        out.push({
          matchId,
          market,
          odds: null,
          suspended: true,
          reason: "JOGO FINALIZADO",
        });
        continue;
      }

      const liveSt = liveMatchState.get(matchId);
      if (!liveSt) {
        out.push({ matchId, market, odds: null, suspended: false });
        continue;
      }

      const allowed =
        liveSt.sport === "tennis" ||
        liveSt.sport === "football" ||
        liveSt.sport === "basketball" ||
        liveSt.sport === "hockey" ||
        liveSt.sport === "baseball" ||
        liveSt.sport === "volleyball";
      if (!allowed) {
        out.push({ matchId, market, odds: null, suspended: false });
        continue;
      }

      const suspendedUntil = liveSt.marketSuspension?.[market] ?? 0;
      const anySuspended =
        liveSt.marketSuspension != null &&
        Object.values(liveSt.marketSuspension).some((ts: any) => ts > now);
      const suspended =
        suspendedUntil > now || (anySuspended && !!liveSt._suspensionReason);
      const reason = suspended
        ? (liveSt._suspensionReason ??
          (liveSt.sport === "tennis"
            ? "PONTO EM JOGO"
            : liveSt.sport === "football"
              ? "EVENTO CRÍTICO"
              : liveSt.sport === "basketball"
                ? "CESTA"
                : liveSt.sport === "hockey"
                  ? "GOLO"
                  : liveSt.sport === "baseball"
                    ? "RUN"
                    : "PONTO"))
        : undefined;

      const curOdd = currentOddForSelection(
        { selection } as SelectionRecord,
        liveSt,
      );
      const odds =
        Number.isFinite(curOdd) && (curOdd as number) > 1.0
          ? Math.max(1.01, curOdd as number)
          : null;
      out.push({
        matchId,
        market,
        odds,
        suspended,
        ...(reason ? { reason } : {}),
      });
    }

    res.json({ selections: out });
  },
);

type CashoutStatus = "available" | "suspended" | "locked" | "closed";

type CashoutPolicy = {
  enabled: boolean;
  unfavorableCycleMs: number;
  unfavorableOpenMs: number;
  oddsWorseMult: number;
  feeMult: number;
};

const DEFAULT_CASHOUT_POLICY: CashoutPolicy = {
  enabled: true,
  unfavorableCycleMs: 60000,
  unfavorableOpenMs: 15000,
  oddsWorseMult: 1.2,
  feeMult: 0.92,
};

const CASHOUT_POLICY_TTL_MS = 30000;
let cashoutPolicyCache: { fetchedAt: number; value: CashoutPolicy } | null =
  null;

function parseBool(v: string | null | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function parseNum(v: string | null | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function getCashoutPolicy(): Promise<CashoutPolicy> {
  const now = Date.now();
  if (
    cashoutPolicyCache &&
    now - cashoutPolicyCache.fetchedAt < CASHOUT_POLICY_TTL_MS
  )
    return cashoutPolicyCache.value;

  const keys = [
    "cashout_enabled",
    "cashout_unfavorable_cycle_ms",
    "cashout_unfavorable_open_ms",
    "cashout_odds_worse_mult",
    "cashout_fee_mult",
  ];

  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(inArray(platformSettingsTable.key, keys));
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.key, r.value);
    const value: CashoutPolicy = {
      enabled: parseBool(
        map.get("cashout_enabled"),
        DEFAULT_CASHOUT_POLICY.enabled,
      ),
      unfavorableCycleMs: Math.max(
        1000,
        parseNum(
          map.get("cashout_unfavorable_cycle_ms"),
          DEFAULT_CASHOUT_POLICY.unfavorableCycleMs,
        ),
      ),
      unfavorableOpenMs: Math.max(
        0,
        parseNum(
          map.get("cashout_unfavorable_open_ms"),
          DEFAULT_CASHOUT_POLICY.unfavorableOpenMs,
        ),
      ),
      oddsWorseMult: Math.max(
        1.0,
        parseNum(
          map.get("cashout_odds_worse_mult"),
          DEFAULT_CASHOUT_POLICY.oddsWorseMult,
        ),
      ),
      feeMult: Math.min(
        1.0,
        Math.max(
          0.01,
          parseNum(map.get("cashout_fee_mult"), DEFAULT_CASHOUT_POLICY.feeMult),
        ),
      ),
    };
    cashoutPolicyCache = { fetchedAt: now, value };
    return value;
  } catch {
    cashoutPolicyCache = { fetchedAt: now, value: DEFAULT_CASHOUT_POLICY };
    return DEFAULT_CASHOUT_POLICY;
  }
}

function normalizeSelectionKey(sel: string): string {
  let s = sel;
  if (s === "1x2-home") s = "home";
  else if (s === "1x2-draw") s = "draw";
  else if (s === "1x2-away") s = "away";
  else if (/^tg-([ou][\d]+)$/.test(s)) s = s.slice(3);
  else if (s === "dc-12") s = "homeOrAway";
  else if (s === "eg-0") s = "eg-g0";
  else if (s === "eg-1") s = "eg-g1";
  else if (s === "eg-2") s = "eg-g2";
  else if (s === "eg-3") s = "eg-g3";
  else if (s === "eg-4") s = "eg-g4";
  else if (s === "eg-5p") s = "eg-g5plus";
  else if (s === "et-res-home") s = "et-home";
  else if (s === "et-res-draw") s = "et-draw";
  else if (s === "et-res-away") s = "et-away";
  else if (s === "et-tie-home") s = "et-tw-home";
  else if (s === "et-tie-away") s = "et-tw-away";
  return s;
}

function extractTeamsFromTitle(title: string): {
  homeTeam?: string;
  awayTeam?: string;
} {
  const raw = String(title ?? "").trim();
  if (!raw) return {};
  const parts = raw.split(/\s+(?:vs|v|x|-|—|–)\s+/i);
  if (parts.length < 2) return {};
  const homeTeam = parts[0]!.trim();
  const awayTeam = parts.slice(1).join(" ").trim();
  return {
    ...(homeTeam ? { homeTeam } : {}),
    ...(awayTeam ? { awayTeam } : {}),
  };
}

function parseDateTimeToIso(
  dateRaw: unknown,
  timeRaw: unknown,
): string | undefined {
  if (typeof dateRaw !== "string" || dateRaw.trim() === "") return undefined;
  const dateStr = dateRaw.trim();
  const timeStr = typeof timeRaw === "string" ? timeRaw.trim() : "";
  const dmy = dateStr.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let date: Date | null = null;
  if (dmy)
    date = new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      0,
      0,
      0,
      0,
    );
  else if (ymd)
    date = new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  if (!date) return undefined;
  const hm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) date.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeKickoffIso(value: unknown): string | undefined {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function extractStoredMarketLine(
  rawValue: unknown,
  rawLabel: unknown,
): number | undefined {
  if (typeof rawValue === "number" && Number.isFinite(rawValue))
    return rawValue;
  if (typeof rawLabel !== "string") return undefined;
  const normalized = rawLabel.replace(/[−–]/g, "-").replace(/\s+/g, " ");
  const signed = normalized.match(/([+-])\s*(\d+(?:[.,]\d+)?)/);
  if (signed) {
    const value = Number(signed[2]!.replace(",", "."));
    if (Number.isFinite(value)) return (signed[1] === "-" ? -1 : 1) * value;
  }
  const unsigned = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!unsigned) return undefined;
  const value = Number(unsigned[1]!.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function normalizeStoredSport(
  raw: unknown,
):
  | "football"
  | "tennis"
  | "basketball"
  | "baseball"
  | "hockey"
  | "volleyball"
  | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === "football" || value === "soccer") return "football";
  if (value === "tennis") return "tennis";
  if (value === "basketball" || value === "nba" || value === "bball")
    return "basketball";
  if (value === "baseball" || value === "mlb") return "baseball";
  if (value === "hockey" || value === "nhl") return "hockey";
  if (value === "volleyball" || value === "volley") return "volleyball";
  return null;
}

function normalizeStoredMatchId(
  rawMatchId: unknown,
  sportRaw: unknown,
): string {
  const raw = String(rawMatchId ?? "").trim();
  if (!raw) return raw;

  const sport = normalizeStoredSport(sportRaw);
  const prefixedMatch = raw.match(
    /^(football|soccer|tennis|nba|bball|basketball|hockey|nhl|baseball|mlb|volley|volleyball)-(?:odds|live)-(\d+)$/i,
  );
  const simpleNumeric = /^\d+$/.test(raw) ? raw : null;

  const build = (
    normalizedSport: ReturnType<typeof normalizeStoredSport>,
    providerId: string,
  ): string => {
    switch (normalizedSport) {
      case "football":
        return `football-v2-${providerId}`;
      case "tennis":
        return `tennis-v2-${providerId}`;
      case "basketball":
        return `bball-v2-${providerId}`;
      case "baseball":
        return `baseball-v2-${providerId}`;
      case "hockey":
        return `hockey-v2-${providerId}`;
      case "volleyball":
        return `volley-odds-${providerId}`;
      default:
        return providerId;
    }
  };

  if (prefixedMatch) {
    const prefixedSportKey = normalizeStoredSport(prefixedMatch[1]);
    if (prefixedSportKey) return build(prefixedSportKey, prefixedMatch[2]!);
  }

  if (simpleNumeric && sport) {
    return build(sport, simpleNumeric);
  }

  return raw;
}

function getTicketKickoffIso(
  selections: unknown,
  fallbackKickoff: unknown,
): string | undefined {
  const fallback = normalizeKickoffIso(fallbackKickoff);
  if (!Array.isArray(selections)) return fallback;
  const timestamps = selections
    .map((sel) =>
      normalizeKickoffIso(
        (sel as Record<string, unknown>)?.kickoffTime ??
          (sel as Record<string, unknown>)?.scheduledAt,
      ),
    )
    .filter((v): v is string => !!v)
    .map((v) => new Date(v).getTime())
    .filter((v) => Number.isFinite(v));
  if (timestamps.length === 0) return fallback;
  return new Date(Math.min(...timestamps)).toISOString();
}

function normalizeStoredSelection(
  rawSelection: unknown,
  fallback: { matchId: string; matchTitle: string; kickoffTime?: unknown },
): unknown {
  if (!rawSelection || typeof rawSelection !== "object") return rawSelection;
  const r = rawSelection as Record<string, unknown>;
  const selection = typeof r.selection === "string" ? r.selection : null;
  if (!selection) return rawSelection;
  const matchTitle =
    typeof r.matchTitle === "string" && r.matchTitle.trim() !== ""
      ? r.matchTitle
      : fallback.matchTitle;
  const kickoffIso =
    normalizeKickoffIso(r.kickoffTime) ??
    normalizeKickoffIso(r.scheduledAt) ??
    parseDateTimeToIso(r.date, r.time) ??
    normalizeKickoffIso(fallback.kickoffTime);
  const { homeTeam, awayTeam } = extractTeamsFromTitle(matchTitle);
  return {
    ...r,
    matchId: normalizeStoredMatchId(r.matchId ?? fallback.matchId, r.sport),
    matchTitle,
    selection: normalizeSelectionKey(selection),
    ...(extractStoredMarketLine(
      (r as { marketLine?: unknown }).marketLine,
      r.label,
    ) !== undefined
      ? {
          marketLine: extractStoredMarketLine(
            (r as { marketLine?: unknown }).marketLine,
            r.label,
          ),
        }
      : {}),
    ...(kickoffIso ? { kickoffTime: kickoffIso, scheduledAt: kickoffIso } : {}),
    ...(homeTeam ? { homeTeam } : {}),
    ...(awayTeam ? { awayTeam } : {}),
  };
}

function currentOddForSelection(
  sel: SelectionRecord,
  liveSt: LiveMatchState,
): number | null {
  const s = normalizeSelectionKey(String(sel.selection ?? ""));
  const m = (liveSt as { markets?: Record<string, unknown> })
    .markets as unknown as Record<string, unknown> | undefined;
  const mk = (m ?? {}) as unknown as {
    doubleChance?: {
      homeOrDraw?: number;
      awayOrDraw?: number;
      homeOrAway?: number;
    };
    bothTeamsScore?: { yes?: number; no?: number };
    totalGoals?: Record<string, number>;
    handicap?: {
      homeMinusOne?: number;
      awayPlusOne?: number;
      homeMinusOneHalf?: number;
      awayPlusOneHalf?: number;
    };
    halfTime?: { home?: number; draw?: number; away?: number };
    secondHalf?: { home?: number; draw?: number; away?: number };
    firstGoal?: { home?: number; noGoal?: number; away?: number };
    drawNoBet?: { home?: number; away?: number };
    asianTotals?: Record<string, number>;
    htft?: Record<string, number>;
    correctScore?: Record<string, number>;
    corners?: Record<string, number>;
    cards?: Record<string, number>;
    winToNil?: { home?: number; away?: number };
    cleanSheet?: { home?: number; away?: number };
    goalOddEven?: { odd?: number; even?: number };
    exactGoals?: Record<string, number>;
    btts1H?: { yes?: number; no?: number };
    btts2H?: { yes?: number; no?: number };
    toWinBothHalves?: { home?: number; away?: number };
    highestScoringHalf?: { first?: number; second?: number; equal?: number };
    htCorrectScore?: Record<string, number>;
    h2CorrectScore?: Record<string, number>;
    teamGoals?: Record<string, number>;
    tennisExtra?: Record<string, unknown>;
    volleyballExtra?: Record<string, unknown>;
    basketballExtra?: Record<string, unknown>;
    hockeyExtra?: Record<string, unknown>;
    etExtra?: Record<string, unknown>;
    penExtra?: Record<string, unknown>;
  };
  const rawMarkets = m as unknown as Record<string, unknown> | undefined;

  const odds1x2 = (
    liveSt as { odds?: { home?: number; draw?: number; away?: number } }
  ).odds;
  if (s === "home")
    return Number.isFinite(odds1x2?.home) ? odds1x2!.home! : null;
  if (s === "draw")
    return Number.isFinite(odds1x2?.draw) ? odds1x2!.draw! : null;
  if (s === "away")
    return Number.isFinite(odds1x2?.away) ? odds1x2!.away! : null;

  if (s === "homeOrDraw" || s === "dc-hd")
    return Number.isFinite(mk.doubleChance?.homeOrDraw)
      ? mk.doubleChance!.homeOrDraw!
      : null;
  if (s === "awayOrDraw" || s === "dc-da")
    return Number.isFinite(mk.doubleChance?.awayOrDraw)
      ? mk.doubleChance!.awayOrDraw!
      : null;
  if (s === "homeOrAway" || s === "dc-ha")
    return Number.isFinite(mk.doubleChance?.homeOrAway)
      ? mk.doubleChance!.homeOrAway!
      : null;

  if (s === "bts-yes")
    return Number.isFinite(mk.bothTeamsScore?.yes)
      ? mk.bothTeamsScore!.yes!
      : null;
  if (s === "bts-no")
    return Number.isFinite(mk.bothTeamsScore?.no)
      ? mk.bothTeamsScore!.no!
      : null;

  if (s === "goe-odd")
    return Number.isFinite(mk.goalOddEven?.odd) ? mk.goalOddEven!.odd! : null;
  if (s === "goe-even")
    return Number.isFinite(mk.goalOddEven?.even) ? mk.goalOddEven!.even! : null;

  if (s === "wtn-h")
    return Number.isFinite(mk.winToNil?.home) ? mk.winToNil!.home! : null;
  if (s === "wtn-a")
    return Number.isFinite(mk.winToNil?.away) ? mk.winToNil!.away! : null;

  if (s === "cs-h")
    return Number.isFinite(mk.cleanSheet?.home) ? mk.cleanSheet!.home! : null;
  if (s === "cs-a")
    return Number.isFinite(mk.cleanSheet?.away) ? mk.cleanSheet!.away! : null;

  if (s === "dnb-home")
    return Number.isFinite(mk.drawNoBet?.home) ? mk.drawNoBet!.home! : null;
  if (s === "dnb-away")
    return Number.isFinite(mk.drawNoBet?.away) ? mk.drawNoBet!.away! : null;

  if (s === "hc-hm1")
    return Number.isFinite(mk.handicap?.homeMinusOne)
      ? mk.handicap!.homeMinusOne!
      : null;
  if (s === "hc-ap1")
    return Number.isFinite(mk.handicap?.awayPlusOne)
      ? mk.handicap!.awayPlusOne!
      : null;
  if (s === "hc-hm15")
    return Number.isFinite(mk.handicap?.homeMinusOneHalf)
      ? mk.handicap!.homeMinusOneHalf!
      : null;
  if (s === "hc-ap15")
    return Number.isFinite(mk.handicap?.awayPlusOneHalf)
      ? mk.handicap!.awayPlusOneHalf!
      : null;

  if (s === "ht-home")
    return Number.isFinite(mk.halfTime?.home) ? mk.halfTime!.home! : null;
  if (s === "ht-draw")
    return Number.isFinite(mk.halfTime?.draw) ? mk.halfTime!.draw! : null;
  if (s === "ht-away")
    return Number.isFinite(mk.halfTime?.away) ? mk.halfTime!.away! : null;

  if (s === "2h-home")
    return Number.isFinite(mk.secondHalf?.home) ? mk.secondHalf!.home! : null;
  if (s === "2h-draw")
    return Number.isFinite(mk.secondHalf?.draw) ? mk.secondHalf!.draw! : null;
  if (s === "2h-away")
    return Number.isFinite(mk.secondHalf?.away) ? mk.secondHalf!.away! : null;

  if (s === "fg-home")
    return Number.isFinite(mk.firstGoal?.home) ? mk.firstGoal!.home! : null;
  if (s === "fg-away")
    return Number.isFinite(mk.firstGoal?.away) ? mk.firstGoal!.away! : null;
  if (s === "fg-none")
    return Number.isFinite(mk.firstGoal?.noGoal) ? mk.firstGoal!.noGoal! : null;

  if (/^[ou]\d+$/.test(s)) {
    const n = parseInt(s.slice(1), 10);
    if (Number.isFinite(n)) {
      const asAsian = mk.asianTotals?.[s];
      if (Number.isFinite(asAsian)) return asAsian!;
      const key = `${s[0] === "o" ? "over" : "under"}${String(n).padStart(2, "0")}`;
      const v = mk.totalGoals?.[key];
      return Number.isFinite(v) ? v! : null;
    }
  }

  if (/^[ou]c\d+$/.test(s)) {
    const key = `${s[0]}${s.slice(2)}`;
    const v = mk.corners?.[key];
    return Number.isFinite(v) ? v! : null;
  }

  if (/^[ou]card\d+$/.test(s)) {
    const key = `${s[0]}${s.slice(5)}`;
    const v = mk.cards?.[key];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("htft-")) {
    const k = s.slice(5);
    const v = mk.htft?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("cs-")) {
    const k = s.slice(3);
    const v = mk.correctScore?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("htcs-")) {
    const k = s.slice(5);
    const v = mk.htCorrectScore?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("h2cs-")) {
    const k = s.slice(5);
    const v = mk.h2CorrectScore?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s.startsWith("eg-")) {
    const k = s.slice(3);
    const v = mk.exactGoals?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (s === "b1h-yes")
    return Number.isFinite(mk.btts1H?.yes) ? mk.btts1H!.yes! : null;
  if (s === "b1h-no")
    return Number.isFinite(mk.btts1H?.no) ? mk.btts1H!.no! : null;
  if (s === "b2h-yes")
    return Number.isFinite(mk.btts2H?.yes) ? mk.btts2H!.yes! : null;
  if (s === "b2h-no")
    return Number.isFinite(mk.btts2H?.no) ? mk.btts2H!.no! : null;

  if (s === "wbh-h")
    return Number.isFinite(mk.toWinBothHalves?.home)
      ? mk.toWinBothHalves!.home!
      : null;
  if (s === "wbh-a")
    return Number.isFinite(mk.toWinBothHalves?.away)
      ? mk.toWinBothHalves!.away!
      : null;

  if (s === "hsf-1")
    return Number.isFinite(mk.highestScoringHalf?.first)
      ? mk.highestScoringHalf!.first!
      : null;
  if (s === "hsf-2")
    return Number.isFinite(mk.highestScoringHalf?.second)
      ? mk.highestScoringHalf!.second!
      : null;
  if (s === "hsf-e")
    return Number.isFinite(mk.highestScoringHalf?.equal)
      ? mk.highestScoringHalf!.equal!
      : null;

  if (s.startsWith("tgh-") || s.startsWith("tga-")) {
    const isHome = s.startsWith("tgh-");
    const dir = s.slice(4, 5);
    const n = s.slice(5);
    const k = `${isHome ? "home" : "away"}${dir === "o" ? "Over" : "Under"}${n}`;
    const v = mk.teamGoals?.[k];
    return Number.isFinite(v) ? v! : null;
  }

  if (/^set[123]-(home|away)$/.test(s)) {
    const setNum = parseInt(s.slice(3, 4), 10);
    const side = s.endsWith("home") ? "home" : "away";
    const vt = mk.tennisExtra as unknown as Record<string, unknown> | undefined;
    const vv = mk.volleyballExtra as unknown as
      | Record<string, unknown>
      | undefined;
    const key = setNum === 1 ? "firstSet" : `set${setNum}`;
    const t = (vt?.[key] as Record<string, unknown> | undefined)?.[side];
    const v = (vv?.[`set${setNum}`] as Record<string, unknown> | undefined)?.[
      side
    ];
    const out = Number.isFinite(t as number)
      ? (t as number)
      : Number.isFinite(v as number)
        ? (v as number)
        : null;
    return out;
  }

  if (/^vs[123][ha]$/.test(s)) {
    const setNum = parseInt(s.slice(2, 3), 10);
    const side = s.endsWith("h") ? "home" : "away";
    const vv = mk.volleyballExtra as unknown as
      | Record<string, unknown>
      | undefined;
    const v = (vv?.[`set${setNum}`] as Record<string, unknown> | undefined)?.[
      side
    ];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^es-(h20|h21|a02|a12)$/.test(s)) {
    const vt = mk.tennisExtra as unknown as Record<string, unknown> | undefined;
    const v = (vt?.["exactSets"] as Record<string, unknown> | undefined)?.[
      s.slice(3)
    ];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^vs-s(30|31|32|03|13|23)$/.test(s)) {
    const vv = mk.volleyballExtra as unknown as
      | Record<string, unknown>
      | undefined;
    const v = (vv?.["exactScore"] as Record<string, unknown> | undefined)?.[
      s.slice(3)
    ];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^q[1234]-(home|away)$/.test(s)) {
    const q = `q${s.slice(1, 2)}`;
    const side = s.endsWith("home") ? "home" : "away";
    const vb = mk.basketballExtra as unknown as
      | Record<string, unknown>
      | undefined;
    const v = (vb?.[q] as Record<string, unknown> | undefined)?.[side];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (/^p[123]-(home|draw|away)$/.test(s)) {
    const p = `period${s.slice(1, 2)}`;
    const side = s.endsWith("home")
      ? "home"
      : s.endsWith("draw")
        ? "draw"
        : "away";
    const vh = mk.hockeyExtra as unknown as Record<string, unknown> | undefined;
    const v = (vh?.[p] as Record<string, unknown> | undefined)?.[side];
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  if (s.startsWith("et-")) {
    const v = mk.etExtra as unknown as Record<string, unknown> | undefined;
    if (!v) return null;

    if (s === "et-home" || s === "et-draw" || s === "et-away") {
      const k = s.slice(3);
      const out = (v["etResult"] as Record<string, unknown> | undefined)?.[k];
      return Number.isFinite(out as number) ? (out as number) : null;
    }

    if (s === "et-tw-home" || s === "et-tw-away") {
      const k = s.slice(6);
      const out = (v["tieWinner"] as Record<string, unknown> | undefined)?.[k];
      return Number.isFinite(out as number) ? (out as number) : null;
    }

    if (s === "et-ng-home" || s === "et-ng-away") {
      const k = s.slice(6);
      const out = (v["nextGoal"] as Record<string, unknown> | undefined)?.[k];
      return Number.isFinite(out as number) ? (out as number) : null;
    }

    if (/^et-[ou]\d+$/.test(s)) {
      const k = s.slice(3);
      const out = (v["totalGoals"] as Record<string, unknown> | undefined)?.[k];
      return Number.isFinite(out as number) ? (out as number) : null;
    }
  }

  if (s === "pen-home" || s === "pen-away") {
    const v = mk.penExtra as unknown as Record<string, unknown> | undefined;
    const k = s.slice(4);
    const out = (v?.["winner"] as Record<string, unknown> | undefined)?.[k];
    return Number.isFinite(out as number) ? (out as number) : null;
  }

  if (liveSt.sport === "basketball") {
    const toNum = (v: unknown): number | null => {
      const n =
        typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    const mTotal = toNum(rawMarkets?.["_total"]);
    const mTotal1H = toNum(rawMarkets?.["_total1H"]);
    const mSpread = toNum(rawMarkets?.["_spread"]);
    const bx = mk.basketballExtra as unknown as
      | {
          q1?: { home?: number; away?: number };
          q2?: { home?: number; away?: number };
          q3?: { home?: number; away?: number };
          q4?: { home?: number; away?: number };
          teamTotalHome?: { line?: number; over?: number; under?: number };
          teamTotalAway?: { line?: number; over?: number; under?: number };
          totalsRange?: Array<{ line?: number; over?: number; under?: number }>;
        }
      | undefined;

    const pts = s.match(/^b-pts-([ou])-(\d+(?:\.\d+)?)$/);
    if (pts) {
      const dir = pts[1]!;
      const line = Number(pts[2]);
      if (!Number.isFinite(line)) return null;
      if (mTotal != null && Math.abs(line - mTotal) < 1e-9) {
        return dir === "o"
          ? Number.isFinite(mk.totalGoals?.over25)
            ? mk.totalGoals!.over25
            : null
          : Number.isFinite(mk.totalGoals?.under25)
            ? mk.totalGoals!.under25
            : null;
      }
      const tr = bx?.totalsRange?.find(
        (x) =>
          Number.isFinite(x.line) && Math.abs((x.line as number) - line) < 1e-9,
      );
      if (!tr) return null;
      const out = dir === "o" ? tr.over : tr.under;
      return Number.isFinite(out) ? (out as number) : null;
    }

    const ptsH1 = s.match(/^b-h1-pts-([ou])-(\d+(?:\.\d+)?)$/);
    if (ptsH1) {
      const dir = ptsH1[1]!;
      const line = Number(ptsH1[2]);
      if (!Number.isFinite(line)) return null;
      if (mTotal1H != null && Math.abs(line - mTotal1H) < 1e-9) {
        return dir === "o"
          ? Number.isFinite(mk.totalGoals?.over15)
            ? mk.totalGoals!.over15
            : null
          : Number.isFinite(mk.totalGoals?.under15)
            ? mk.totalGoals!.under15
            : null;
      }
      return null;
    }

    const sp = s.match(/^b-spread-(home|away)-(\d+(?:\.\d+)?)$/);
    if (sp) {
      const side = sp[1]!;
      const line = Number(sp[2]);
      if (!Number.isFinite(line)) return null;
      if (
        mSpread != null &&
        Math.abs(Math.abs(mSpread) - Math.abs(line)) < 1e-9
      ) {
        if (side === "home")
          return Number.isFinite(mk.handicap?.homeMinusOne)
            ? mk.handicap!.homeMinusOne!
            : null;
        return Number.isFinite(mk.handicap?.awayPlusOne)
          ? mk.handicap!.awayPlusOne!
          : null;
      }
      return null;
    }

    const tt = s.match(/^b-tt-(home|away)-([ou])-(\d+(?:\.\d+)?)$/);
    if (tt) {
      const side = tt[1]!;
      const dir = tt[2]!;
      const line = Number(tt[3]);
      if (!Number.isFinite(line)) return null;
      const obj = side === "home" ? bx?.teamTotalHome : bx?.teamTotalAway;
      if (
        !obj ||
        !Number.isFinite(obj.line) ||
        Math.abs((obj.line as number) - line) > 1e-9
      )
        return null;
      const out = dir === "o" ? obj.over : obj.under;
      return Number.isFinite(out) ? (out as number) : null;
    }

    if (/^q[1234]-(home|away)$/.test(s)) {
      const qNum = Number(s[1]);
      const side = s.endsWith("home") ? "home" : "away";
      const qKey = `q${qNum}` as "q1" | "q2" | "q3" | "q4";
      const out = bx?.[qKey]?.[side];
      return Number.isFinite(out) ? (out as number) : null;
    }

    if (s === "h1-home")
      return Number.isFinite(mk.halfTime?.home) ? mk.halfTime!.home! : null;
    if (s === "h1-away")
      return Number.isFinite(mk.halfTime?.away) ? mk.halfTime!.away! : null;
  }

  if (liveSt.sport === "hockey") {
    const toNum = (v: unknown): number | null => {
      const n =
        typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    const hx = mk.hockeyExtra as unknown as
      | {
          period2?: { home?: number; draw?: number; away?: number };
          period3?: { home?: number; draw?: number; away?: number };
          period1Total?: { line?: number; over?: number; under?: number };
          period2Total?: { line?: number; over?: number; under?: number };
          period3Total?: { line?: number; over?: number; under?: number };
          shotsOnGoal?: { line?: number; over?: number; under?: number };
        }
      | undefined;

    const labelLine =
      typeof sel.label === "string"
        ? toNum(sel.label.match(/(\d+(?:\.\d+)?)/)?.[1] ?? null)
        : null;

    if (s === "p1-home")
      return Number.isFinite(mk.halfTime?.home) ? mk.halfTime!.home! : null;
    if (s === "p1-draw")
      return Number.isFinite(mk.halfTime?.draw) ? mk.halfTime!.draw! : null;
    if (s === "p1-away")
      return Number.isFinite(mk.halfTime?.away) ? mk.halfTime!.away! : null;

    const perAlias = s.match(/^per([123])-(home|draw|away)$/);
    if (perAlias) {
      if (perAlias[1] === "1") {
        const side = perAlias[2]!;
        if (side === "home")
          return Number.isFinite(mk.halfTime?.home) ? mk.halfTime!.home! : null;
        if (side === "draw")
          return Number.isFinite(mk.halfTime?.draw) ? mk.halfTime!.draw! : null;
        return Number.isFinite(mk.halfTime?.away) ? mk.halfTime!.away! : null;
      }
      const p = `period${perAlias[1]}` as "period2" | "period3";
      const side = perAlias[2]!;
      const out = (hx?.[p] as Record<string, unknown> | undefined)?.[side];
      return Number.isFinite(out as number) ? (out as number) : null;
    }

    const per = s.match(/^p([23])-(home|draw|away)$/);
    if (per) {
      const p = `period${per[1]}` as "period2" | "period3";
      const side = per[2]!;
      const out = (hx?.[p] as Record<string, unknown> | undefined)?.[side];
      return Number.isFinite(out as number) ? (out as number) : null;
    }

    const pt = s.match(/^p([123])t-([ou])(?:-(\d+(?:\.\d+)?))?$/);
    if (pt) {
      const p =
        pt[1] === "1"
          ? hx?.period1Total
          : pt[1] === "2"
            ? hx?.period2Total
            : hx?.period3Total;
      if (!p) return null;
      const line = pt[3] ? toNum(pt[3]) : labelLine;
      if (
        line == null ||
        !Number.isFinite(p.line) ||
        Math.abs((p.line as number) - line) > 1e-9
      )
        return null;
      const out = pt[2] === "o" ? p.over : p.under;
      return Number.isFinite(out) ? (out as number) : null;
    }

    const sog = s.match(/^sog-([ou])(?:-(\d+(?:\.\d+)?))?$/);
    if (sog) {
      const p = hx?.shotsOnGoal;
      if (!p) return null;
      const line = sog[2] ? toNum(sog[2]) : labelLine;
      if (
        line == null ||
        !Number.isFinite(p.line) ||
        Math.abs((p.line as number) - line) > 1e-9
      )
        return null;
      const out = sog[1] === "o" ? p.over : p.under;
      return Number.isFinite(out) ? (out as number) : null;
    }
  }

  if (liveSt.sport === "baseball") {
    const toNum = (v: unknown): number | null => {
      const n =
        typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isFinite(n) ? n : null;
    };

    const labelLine =
      typeof sel.label === "string"
        ? toNum(sel.label.match(/(\d+(?:\.\d+)?)/)?.[1] ?? null)
        : null;
    const mt = toNum(rawMarkets?.["_total"]);
    const spread = toNum(rawMarkets?.["_spread"]) ?? 1.5;
    const mx = (rawMarkets ?? {}) as unknown as {
      mlbExtra?: {
        f5Result?: { home?: number; away?: number };
        f5Total?: { line?: number; over?: number; under?: number };
      };
    };
    const f5 = mx.mlbExtra;

    const tot =
      s.match(/^mlb-tot-([ou])-(\d+(?:\.\d+)?)$/) ||
      s.match(/^mlb-([ou])(\d+(?:\.\d+)?)$/);
    if (tot) {
      const dir = tot[1]!;
      const line = toNum(tot[2]!);
      if (line == null) return null;
      if (mt == null) return null;
      const lo = Math.round((mt - 0.5) * 10) / 10;
      const hi = Math.round((mt + 0.5) * 10) / 10;
      if (Math.abs(line - lo) < 1e-9) {
        return dir === "o"
          ? Number.isFinite(mk.totalGoals?.over25)
            ? mk.totalGoals!.over25
            : null
          : Number.isFinite(mk.totalGoals?.under25)
            ? mk.totalGoals!.under25
            : null;
      }
      if (Math.abs(line - mt) < 1e-9) {
        return dir === "o"
          ? Number.isFinite(mk.totalGoals?.over35)
            ? mk.totalGoals!.over35
            : null
          : Number.isFinite(mk.totalGoals?.under35)
            ? mk.totalGoals!.under35
            : null;
      }
      if (Math.abs(line - hi) < 1e-9) {
        return dir === "o"
          ? Number.isFinite(mk.totalGoals?.over45)
            ? mk.totalGoals!.over45
            : null
          : Number.isFinite(mk.totalGoals?.under45)
            ? mk.totalGoals!.under45
            : null;
      }
      return null;
    }

    if (s === "f5-home" || s === "mlb-f5-home")
      return Number.isFinite(f5?.f5Result?.home) ? f5!.f5Result!.home! : null;
    if (s === "f5-away" || s === "mlb-f5-away")
      return Number.isFinite(f5?.f5Result?.away) ? f5!.f5Result!.away! : null;

    const f5t =
      s.match(/^mlb-f5t-([ou])-(\d+(?:\.\d+)?)$/) || s.match(/^f5t-([ou])$/);
    if (f5t) {
      const dir = f5t[1]!;
      const line = f5t[2] ? toNum(f5t[2]) : labelLine;
      if (line == null) return null;
      if (
        !Number.isFinite(f5?.f5Total?.line) ||
        Math.abs((f5!.f5Total!.line as number) - line) > 1e-9
      )
        return null;
      const out = dir === "o" ? f5!.f5Total!.over : f5!.f5Total!.under;
      return Number.isFinite(out) ? (out as number) : null;
    }

    const rl =
      s.match(/^mlb-rl-(home|away)-(\d+(?:\.\d+)?)$/) ||
      s.match(/^rl-(home|away)$/) ||
      s.match(/^(hm1|ap1)$/);
    if (rl) {
      const side =
        rl[1] === "hm1"
          ? "home"
          : rl[1] === "ap1"
            ? "away"
            : rl[1] === "home"
              ? "home"
              : rl[1] === "away"
                ? "away"
                : "home";
      const line = rl[2] ? toNum(rl[2]) : spread;
      if (line == null || Math.abs(line - 1.5) > 1e-9) return null;
      if (side === "home")
        return Number.isFinite(mk.handicap?.homeMinusOne)
          ? mk.handicap!.homeMinusOne!
          : null;
      return Number.isFinite(mk.handicap?.awayPlusOne)
        ? mk.handicap!.awayPlusOne!
        : null;
    }
  }

  return null;
}

function getBetSelections(bet: {
  matchId: string;
  matchTitle: string;
  selections: unknown;
  totalOdds: string;
}): SelectionRecord[] {
  if (Array.isArray(bet.selections)) return bet.selections as SelectionRecord[];
  return [
    {
      matchId: bet.matchId,
      matchTitle: bet.matchTitle,
      selection: "home",
      odd: parseFloat(bet.totalOdds),
      market: "result",
      label: "home",
    },
  ];
}

type OpenBetSelectionState = {
  matchId?: string;
  outcome: "won" | "lost" | "void" | "pending";
  finalScore?: { home: number; away: number };
  htScore?: { htHome: number; htAway: number };
};

type OpenBetStatePayload = {
  betId: number;
  statusPreview: "pending" | "won" | "lost" | "void";
  selections: OpenBetSelectionState[];
};

function normalizeOpenBetOutcome(
  outcome: ReturnType<typeof scoreOutcomeForSel>,
): OpenBetSelectionState["outcome"] {
  if (outcome === "won" || outcome === "half_won") return "won";
  if (outcome === "lost" || outcome === "half_lost") return "lost";
  if (outcome === "void") return "void";
  return "pending";
}

function buildOpenBetStatePayload(bet: {
  id: number;
  matchId: string;
  matchTitle: string;
  selections: unknown;
  totalOdds: string;
}): OpenBetStatePayload {
  const selections = getBetSelections(bet);
  const isSingleLeg = selections.length === 1;

  const nextSelections = selections.map((sel): OpenBetSelectionState => {
    const matchId = sel.matchId ?? (isSingleLeg ? bet.matchId : undefined);
    const storedOutcome = normalizeOpenBetOutcome(sel.outcome ?? null);
    if (!matchId) {
      return {
        ...(sel.matchId ? { matchId: sel.matchId } : {}),
        outcome: storedOutcome,
        ...(sel.finalScore ? { finalScore: sel.finalScore } : {}),
        ...(sel.htScore ? { htScore: sel.htScore } : {}),
      };
    }

    const result = finishedMatchResults.get(String(matchId));
    if (!result) {
      return {
        matchId: String(matchId),
        outcome: storedOutcome,
        ...(sel.finalScore ? { finalScore: sel.finalScore } : {}),
        ...(sel.htScore ? { htScore: sel.htScore } : {}),
      };
    }

    const ht =
      typeof result.htHome === "number" && typeof result.htAway === "number"
        ? { htHome: result.htHome, htAway: result.htAway }
        : undefined;

    const outcome = scoreOutcomeForSel(
      sel,
      { home: result.home, away: result.away },
      ht,
      {
        status: result.status,
        cornersTotal: result.cornersTotal,
        cardsTotal: result.cardsTotal,
        firstGoal: result.firstGoal,
        extras: result.extras,
        finishedAt: result.finishedAt,
      },
    );

    return {
      matchId: String(matchId),
      outcome: normalizeOpenBetOutcome(outcome),
      finalScore: { home: result.home, away: result.away },
      ...(ht ? { htScore: ht } : {}),
    };
  });

  const outcomes = nextSelections.map((sel) => sel.outcome);
  const statusPreview = outcomes.some((outcome) => outcome === "lost")
    ? "lost"
    : outcomes.length > 0 && outcomes.every((outcome) => outcome === "void")
      ? "void"
      : outcomes.length > 0 &&
          outcomes.every((outcome) => outcome !== "pending")
        ? "won"
        : "pending";

  return {
    betId: bet.id,
    statusPreview,
    selections: nextSelections,
  };
}

async function getOpenBetStatesForUser(
  userId: number,
): Promise<{ bets: OpenBetStatePayload[] }> {
  const bets = await db
    .select({
      id: betsTable.id,
      matchId: betsTable.matchId,
      matchTitle: betsTable.matchTitle,
      selections: betsTable.selections,
      totalOdds: betsTable.totalOdds,
    })
    .from(betsTable)
    .where(and(eq(betsTable.userId, userId), eq(betsTable.status, "pending")))
    .orderBy(desc(betsTable.createdAt));

  return {
    bets: bets.map((bet) =>
      buildOpenBetStatePayload({
        id: bet.id,
        matchId: bet.matchId,
        matchTitle: bet.matchTitle,
        selections: bet.selections,
        totalOdds: bet.totalOdds,
      }),
    ),
  };
}

function getBetEventIds(bet: {
  matchId: string;
  matchTitle: string;
  selections: unknown;
  totalOdds: string;
}): string[] {
  const ids = new Set<string>();
  for (const sel of getBetSelections(bet)) {
    const matchId = String(sel.matchId ?? "").trim();
    if (matchId) ids.add(matchId);
  }
  const fallbackMatchId = String(bet.matchId ?? "").trim();
  if (fallbackMatchId) ids.add(fallbackMatchId);
  return [...ids];
}

async function getCashoutDisabledEventIdsForBets(
  bets: Array<{
    matchId: string;
    matchTitle: string;
    selections: unknown;
    totalOdds: string;
  }>,
): Promise<Set<string>> {
  const eventIds = [...new Set(bets.flatMap((bet) => getBetEventIds(bet)))];
  if (eventIds.length === 0) return new Set<string>();

  const rows = await db
    .select({ eventId: eventAdminOverridesTable.eventId })
    .from(eventAdminOverridesTable)
    .where(
      and(
        inArray(eventAdminOverridesTable.eventId, eventIds),
        eq(eventAdminOverridesTable.forceCashoutDisable, true),
      ),
    );

  return new Set(rows.map((row) => String(row.eventId)));
}

function cashoutCalcForBet(args: {
  bet: {
    id?: number;
    matchId: string;
    matchTitle: string;
    selections: unknown;
    stake: string;
    totalOdds: string;
    status: string;
  };
  policy: CashoutPolicy;
  existingState?: { unfavorableSince: Date; reason?: string | null } | null;
  cashoutDisabledEventIds?: Set<string>;
}): {
  info: {
    cashoutStatus: CashoutStatus;
    cashoutReason?: string;
    cashoutEstimate?: string;
  };
  stateOp:
    | { type: "none" }
    | { type: "insert"; since: Date; reason: string }
    | { type: "update_reason"; reason: string }
    | { type: "delete" };
} {
  const { bet, policy } = args;
  const existing = args.existingState ?? null;
  const cashoutDisabledEventIds =
    args.cashoutDisabledEventIds ?? new Set<string>();
  const betId = bet.id ?? null;
  if (bet.status !== "pending")
    return {
      info: { cashoutStatus: "closed" },
      stateOp: betId != null ? { type: "delete" } : { type: "none" },
    };
  if (!policy.enabled)
    return {
      info: { cashoutStatus: "locked", cashoutReason: "Cash out desativado" },
      stateOp: betId != null ? { type: "delete" } : { type: "none" },
    };

  const now = Date.now();
  const selections = getBetSelections(bet);
  if (selections.length === 0)
    return {
      info: { cashoutStatus: "locked", cashoutReason: "Sem seleções" },
      stateOp: betId != null ? { type: "delete" } : { type: "none" },
    };
  if (
    selections.some(
      (sel) => sel.matchId && cashoutDisabledEventIds.has(String(sel.matchId)),
    )
  ) {
    return {
      info: {
        cashoutStatus: "locked",
        cashoutReason: "Cash out desativado manualmente para este evento",
      },
      stateOp: betId != null ? { type: "delete" } : { type: "none" },
    };
  }

  const stake = parseFloat(bet.stake);
  const originalOdds = parseFloat(bet.totalOdds);
  if (
    !Number.isFinite(stake) ||
    !Number.isFinite(originalOdds) ||
    stake <= 0 ||
    originalOdds <= 0
  ) {
    return {
      info: { cashoutStatus: "locked", cashoutReason: "Dados inválidos" },
      stateOp: betId != null ? { type: "delete" } : { type: "none" },
    };
  }

  let anyLive = false;
  let suspendedReason: string | null = null;
  let unfavorableReason: string | null = null;
  let currentOddsProduct = 1;

  for (const sel of selections) {
    const mId = sel.matchId;
    const liveSt = mId ? liveMatchState.get(String(mId)) : undefined;
    if (liveSt) {
      anyLive = true;
      const suspended =
        (liveSt.marketSuspension != null &&
          Object.values(liveSt.marketSuspension).some((ts) => ts > now)) ||
        !!liveSt._suspensionReason;
      if (suspended && !suspendedReason)
        suspendedReason = liveSt._suspensionReason ?? "LANCE CRÍTICO";

      if (
        !unfavorableReason &&
        typeof liveSt.homeScore === "number" &&
        typeof liveSt.awayScore === "number"
      ) {
        const k = normalizeSelectionKey(String(sel.selection ?? ""));
        if (
          (k === "home" ||
            k === "homeOrDraw" ||
            k === "dc-hd" ||
            k === "dnb-home") &&
          liveSt.homeScore < liveSt.awayScore
        )
          unfavorableReason = "Seleção está em desvantagem";
        if (
          (k === "away" ||
            k === "awayOrDraw" ||
            k === "dc-da" ||
            k === "dnb-away") &&
          liveSt.awayScore < liveSt.homeScore
        )
          unfavorableReason = "Seleção está em desvantagem";
      }
    }

    const baseOdd = Math.max(1.01, Number(sel.odd ?? 1.01));
    if (!liveSt) {
      currentOddsProduct *= baseOdd;
      continue;
    }

    const curOdd = currentOddForSelection(sel, liveSt);
    const useOdd =
      Number.isFinite(curOdd) && (curOdd as number) > 1.0
        ? Math.max(1.01, curOdd as number)
        : baseOdd;
    currentOddsProduct *= useOdd;
    if (
      !unfavorableReason &&
      Number.isFinite(curOdd) &&
      (curOdd as number) >= baseOdd * policy.oddsWorseMult
    )
      unfavorableReason = "Odds ficaram desfavoráveis";
  }

  if (!anyLive)
    return {
      info: { cashoutStatus: "locked", cashoutReason: "Sem dados ao vivo" },
      stateOp: betId != null ? { type: "delete" } : { type: "none" },
    };
  if (suspendedReason)
    return {
      info: { cashoutStatus: "suspended", cashoutReason: suspendedReason },
      stateOp: { type: "none" },
    };

  if (unfavorableReason) {
    const since = existing?.unfavorableSince?.getTime?.() ?? now;
    const elapsed = Math.max(0, now - since);
    const open = elapsed % policy.unfavorableCycleMs < policy.unfavorableOpenMs;
    if (!open) {
      const op =
        betId == null
          ? { type: "none" as const }
          : existing == null
            ? {
                type: "insert" as const,
                since: new Date(now),
                reason: unfavorableReason,
              }
            : existing.reason !== unfavorableReason
              ? { type: "update_reason" as const, reason: unfavorableReason }
              : { type: "none" as const };
      return {
        info: { cashoutStatus: "suspended", cashoutReason: unfavorableReason },
        stateOp: op,
      };
    }

    const op =
      betId == null
        ? { type: "none" as const }
        : existing == null
          ? {
              type: "insert" as const,
              since: new Date(now),
              reason: unfavorableReason,
            }
          : existing.reason !== unfavorableReason
            ? { type: "update_reason" as const, reason: unfavorableReason }
            : { type: "none" as const };

    const estimate = Math.max(
      0,
      Number(
        (
          ((stake * originalOdds) / Math.max(1.01, currentOddsProduct)) *
          policy.feeMult
        ).toFixed(2),
      ),
    );
    return {
      info: {
        cashoutStatus: "available",
        cashoutEstimate: estimate.toFixed(2),
      },
      stateOp: op,
    };
  }

  const estimate = Math.max(
    0,
    Number(
      (
        ((stake * originalOdds) / Math.max(1.01, currentOddsProduct)) *
        policy.feeMult
      ).toFixed(2),
    ),
  );
  return {
    info: { cashoutStatus: "available", cashoutEstimate: estimate.toFixed(2) },
    stateOp:
      existing != null && betId != null ? { type: "delete" } : { type: "none" },
  };
}

// ─── POST /api/bets/place ─────────────────────────────────────────────────────
router.post(
  "/place",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    const {
      matchId,
      matchTitle,
      selections,
      stake,
      totalOdds,
      isFreebet,
      kickoffTime,
    } = (authReq as any).body;
    // potentialWin is intentionally NOT read from req.body — always recalculated server-side

    if (!matchId || !matchTitle || !selections || !stake || !totalOdds) {
      res.status(400).json({ error: "Missing bet details" });
      return;
    }

    const betStake = parseFloat(stake);
    const betOdds = parseFloat(totalOdds);

    if (
      !Number.isFinite(betStake) ||
      betStake < MIN_STAKE ||
      betStake > MAX_STAKE
    ) {
      res.status(400).json({
        error: `Valor de aposta inválido. Mínimo €${MIN_STAKE.toFixed(2)}, máximo €${MAX_STAKE.toFixed(2)}.`,
      });
      return;
    }
    if (!Number.isFinite(betOdds) || betOdds < MIN_ODDS || betOdds > MAX_ODDS) {
      res
        .status(400)
        .json({ error: "Odds inválidas. Fora do intervalo permitido." });
      return;
    }

    // Server-side recalculation of potentialWin — never trust the client value
    const potentialWin = (betStake * betOdds).toFixed(2);
    const stakeStr = betStake.toFixed(2);
    const oddsStr = betOdds.toFixed(2);

    // Reject bets on matches that have already finished
    if (finishedMatchResults.has(matchId)) {
      res
        .status(400)
        .json({ error: "Este jogo já terminou. Aposta não aceite." });
      return;
    }

    const now = Date.now();
    const selList: Array<{ matchId?: unknown; market?: unknown }> =
      Array.isArray(selections)
        ? (selections as Array<{ matchId?: unknown; market?: unknown }>)
        : [];

    if (selList.length === 0) {
      const liveSt = liveMatchState.get(String(matchId));
      if (
        liveSt?.sport === "tennis" ||
        liveSt?.sport === "football" ||
        liveSt?.sport === "basketball" ||
        liveSt?.sport === "hockey" ||
        liveSt?.sport === "baseball" ||
        liveSt?.sport === "volleyball"
      ) {
        const anySuspended =
          liveSt.marketSuspension != null &&
          Object.values(liveSt.marketSuspension).some((ts: any) => ts > now);
        if (anySuspended || liveSt._suspensionReason) {
          res.status(409).json({
            error:
              "Mercado suspenso. Aguarde alguns segundos e tente novamente.",
            reason:
              liveSt._suspensionReason ??
              (liveSt.sport === "tennis"
                ? "PONTO EM JOGO"
                : liveSt.sport === "football"
                  ? "EVENTO CRÍTICO"
                  : liveSt.sport === "basketball"
                    ? "CESTA"
                    : liveSt.sport === "hockey"
                      ? "GOLO"
                      : liveSt.sport === "baseball"
                        ? "RUN"
                        : "PONTO"),
          });
          return;
        }
      }
    }

    for (const sel of selList) {
      const mId = String(sel.matchId ?? matchId);
      const liveSt = liveMatchState.get(mId);
      if (!liveSt) continue;
      if (
        liveSt.sport !== "tennis" &&
        liveSt.sport !== "football" &&
        liveSt.sport !== "basketball" &&
        liveSt.sport !== "hockey" &&
        liveSt.sport !== "baseball" &&
        liveSt.sport !== "volleyball"
      )
        continue;

      const marketKey =
        typeof sel.market === "string" && sel.market.trim() !== ""
          ? sel.market
          : "result";

      const suspendedUntil = liveSt.marketSuspension?.[marketKey] ?? 0;
      const anySuspended =
        liveSt.marketSuspension != null &&
        Object.values(liveSt.marketSuspension).some((ts: any) => ts > now);
      const suspended =
        suspendedUntil > now || (anySuspended && !!liveSt._suspensionReason);

      if (suspended) {
        res.status(409).json({
          error: "Mercado suspenso. Aguarde alguns segundos e tente novamente.",
          reason:
            liveSt._suspensionReason ??
            (liveSt.sport === "tennis"
              ? "PONTO EM JOGO"
              : liveSt.sport === "football"
                ? "EVENTO CRÍTICO"
                : liveSt.sport === "basketball"
                  ? "CESTA"
                  : liveSt.sport === "hockey"
                    ? "GOLO"
                    : liveSt.sport === "baseball"
                      ? "RUN"
                      : "PONTO"),
        });
        return;
      }
    }

    const useFreebets = isFreebet === true;
    const selectionsToStore = Array.isArray(selections)
      ? selections.map((x) =>
          normalizeStoredSelection(x, {
            matchId: String(matchId),
            matchTitle,
            kickoffTime,
          }),
        )
      : selections;
    const ticketKickoffIso = getTicketKickoffIso(
      selectionsToStore,
      kickoffTime,
    );

    try {
      const result = await db.transaction(async (tx: any) => {
        if (useFreebets) {
          // Atomic freebet deduction — check AND deduct in a single SQL statement
          // to prevent race conditions from concurrent requests
          const updated = await tx
            .update(usersTable)
            .set({
              freebetBalance: sql`${usersTable.freebetBalance} - ${stakeStr}::numeric`,
            })
            .where(
              and(
                eq(usersTable.id, authReq.user!.id),
                sql`${usersTable.freebetBalance}::numeric >= ${stakeStr}::numeric`,
              ),
            )
            .returning({ freebetBalance: usersTable.freebetBalance });

          if (updated.length === 0) {
            throw Object.assign(new Error("Saldo de freebets insuficiente"), {
              status: 400,
            });
          }

          const [bet] = await tx
            .insert(betsTable)
            .values({
              userId: authReq.user!.id,
              matchId,
              matchTitle,
              selections: selectionsToStore,
              stake: stakeStr,
              potentialWin,
              totalOdds: oddsStr,
              isFreebet: "true",
              kickoffTime: ticketKickoffIso ? new Date(ticketKickoffIso) : null,
              status: "pending",
            })
            .returning();

          return { bet, newFbBalance: updated[0]!.freebetBalance };
        } else {
          // Atomic balance deduction — check AND deduct in one SQL statement,
          // preventing race conditions when multiple requests arrive simultaneously
          const updated = await tx
            .update(usersTable)
            .set({ balance: sql`${usersTable.balance} - ${stakeStr}::numeric` })
            .where(
              and(
                eq(usersTable.id, authReq.user!.id),
                sql`${usersTable.balance}::numeric >= ${stakeStr}::numeric`,
              ),
            )
            .returning({ balance: usersTable.balance });

          if (updated.length === 0) {
            throw Object.assign(new Error("Saldo insuficiente"), {
              status: 400,
            });
          }

          const [bet] = await tx
            .insert(betsTable)
            .values({
              userId: authReq.user!.id,
              matchId,
              matchTitle,
              selections: selectionsToStore,
              stake: stakeStr,
              potentialWin,
              totalOdds: oddsStr,
              isFreebet: "false",
              status: "pending",
            })
            .returning();

          await insertLedgerEntry(tx, {
            userId: authReq.user!.id,
            amount: (-parseFloat(stakeStr)).toFixed(2),
            kind: "bet_stake_debit",
            idempotencyKey: `bet:${bet.id}:stake_debit`,
            refType: "bet",
            refId: String(bet.id),
            metadata: { matchId },
          });

          return { bet, newBalance: updated[0]!.balance };
        }
      });

      res.status(201).json(result);
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      logger.error({ err }, "Bet placement error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── GET /api/bets/my ─────────────────────────────────────────────────────────
router.get(
  "/open-states",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    try {
      const payload = await getOpenBetStatesForUser(authReq.user!.id);
      res.json(payload);
    } catch (err) {
      logger.error(
        { err, userId: authReq.user?.id },
        "Fetch open bet states error",
      );
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/open-states-stream",
  async (req: Request, res: Response): Promise<void> => {
    const token = String(req.query["token"] ?? "").trim();
    if (!token) {
      res.status(401).json({ error: "Missing token" });
      return;
    }

    let user: { id: number; email: string };
    try {
      user = verifyAuthToken(token);
    } catch (err) {
      logger.error({ err }, "Open bet states stream auth failed");
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof (res as any).flushHeaders === "function")
      (res as any).flushHeaders();

    const writePayload = async (): Promise<void> => {
      const payload = await getOpenBetStatesForUser(user.id);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await writePayload();
    } catch (err) {
      logger.error(
        { err, userId: user.id },
        "Initial open bet states stream write failed",
      );
      res.end();
      return;
    }

    const interval = setInterval(() => {
      void writePayload().catch((err) => {
        logger.error(
          { err, userId: user.id },
          "Open bet states stream push failed",
        );
      });
    }, 5000);

    const keepAlive = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        /* ignore */
      }
    }, 5000);

    req.on("close", () => {
      clearInterval(interval);
      clearInterval(keepAlive);
    });
  },
);

router.get(
  "/my",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    try {
      const bets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.userId, authReq.user!.id))
        .orderBy(desc(betsTable.createdAt));

      const betIds = bets.map((b) => b.id);
      const logs =
        betIds.length === 0
          ? []
          : await db
              .select({
                betId: settlementLogsTable.betId,
                createdAt: settlementLogsTable.createdAt,
              })
              .from(settlementLogsTable)
              .where(
                and(
                  eq(settlementLogsTable.oldStatus, "pending"),
                  inArray(settlementLogsTable.betId, betIds),
                ),
              )
              .orderBy(asc(settlementLogsTable.createdAt));
      const firstSettleMap = new Map<number, Date>();
      for (const l of logs) {
        if (!firstSettleMap.has(l.betId))
          firstSettleMap.set(l.betId, l.createdAt);
      }
      const policy = await getCashoutPolicy();
      const states =
        betIds.length === 0
          ? []
          : await db
              .select({
                betId: cashoutStatesTable.betId,
                unfavorableSince: cashoutStatesTable.unfavorableSince,
                reason: cashoutStatesTable.reason,
              })
              .from(cashoutStatesTable)
              .where(inArray(cashoutStatesTable.betId, betIds));
      const stateMap = new Map<
        number,
        { unfavorableSince: Date; reason?: string | null }
      >();
      for (const s of states)
        stateMap.set(s.betId, {
          unfavorableSince: s.unfavorableSince,
          reason: s.reason,
        });
      const cashoutDisabledEventIds = await getCashoutDisabledEventIdsForBets(
        bets as Array<{
          matchId: string;
          matchTitle: string;
          selections: unknown;
          totalOdds: string;
        }>,
      );

      const inserts: Array<{
        betId: number;
        unfavorableSince: Date;
        reason: string;
        updatedAt: Date;
      }> = [];
      const updates: Array<{ betId: number; reason: string; updatedAt: Date }> =
        [];
      const deletes: number[] = [];
      const nowDate = new Date();

      const enriched = bets.map((b: any) => {
        const existing = stateMap.get(b.id) ?? null;
        const calc = cashoutCalcForBet({
          bet: b as unknown as {
            id?: number;
            matchId: string;
            matchTitle: string;
            selections: unknown;
            stake: string;
            totalOdds: string;
            status: string;
          },
          policy,
          existingState: existing,
          cashoutDisabledEventIds,
        });

        if (calc.stateOp.type === "insert" && b.id != null)
          inserts.push({
            betId: b.id,
            unfavorableSince: calc.stateOp.since,
            reason: calc.stateOp.reason,
            updatedAt: nowDate,
          });
        else if (calc.stateOp.type === "update_reason" && b.id != null)
          updates.push({
            betId: b.id,
            reason: calc.stateOp.reason,
            updatedAt: nowDate,
          });
        else if (calc.stateOp.type === "delete" && b.id != null)
          deletes.push(b.id);

        const settledAt = firstSettleMap.get(b.id) ?? null;
        const createdAtDate =
          b.createdAt instanceof Date
            ? b.createdAt
            : new Date(b.createdAt as unknown as string);
        const settlementSeconds = settledAt
          ? Math.max(
              0,
              Math.round(
                (settledAt.getTime() - createdAtDate.getTime()) / 1000,
              ),
            )
          : null;

        const status = String(b.status);
        const stakeNum = parseFloat(String(b.stake));
        const payout =
          status === "won"
            ? String(b.potentialWin)
            : status === "cashed_out"
              ? b.cashoutValue
                ? String(b.cashoutValue)
                : null
              : status === "voided"
                ? String(b.stake)
                : status === "lost"
                  ? "0.00"
                  : null;
        const netProfit =
          payout === null ? null : (parseFloat(payout) - stakeNum).toFixed(2);

        return {
          ...b,
          ...calc.info,
          settledAt,
          settlementSeconds,
          payout,
          netProfit,
        };
      });

      if (deletes.length > 0) {
        await db
          .delete(cashoutStatesTable)
          .where(inArray(cashoutStatesTable.betId, deletes));
      }
      if (inserts.length > 0) {
        await db
          .insert(cashoutStatesTable)
          .values(inserts)
          .onConflictDoNothing();
      }
      for (const u of updates) {
        await db
          .update(cashoutStatesTable)
          .set({ reason: u.reason, updatedAt: u.updatedAt })
          .where(eq(cashoutStatesTable.betId, u.betId));
      }

      res.json(enriched);
    } catch (err) {
      logger.error({ err }, "Fetch bets error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── POST /api/bets/:id/cashout ───────────────────────────────────────────────
router.post(
  "/:id/cashout",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    const betId = parseInt(String((authReq as any).params["id"]), 10);

    if (isNaN(betId)) {
      res.status(400).json({ error: "Invalid bet ID" });
      return;
    }

    try {
      const [bet] = await db
        .select()
        .from(betsTable)
        .where(
          and(eq(betsTable.id, betId), eq(betsTable.userId, authReq.user!.id)),
        )
        .limit(1);

      if (!bet) {
        res.status(404).json({ error: "Bet not found" });
        return;
      }

      if (bet.status !== "pending") {
        res.status(400).json({ error: "Bet is not eligible for cash out" });
        return;
      }

      // ── Block cash out if any leg is already lost (real-time check, before
      //    the 60-second settlement worker has a chance to run) ──────────────
      const selRecs = (bet.selections as SelectionRecord[]) ?? [];
      const isSingleLeg = selRecs.length === 1;
      const hasLostLeg = selRecs.some((sel) => {
        const mId = sel.matchId ?? (isSingleLeg ? bet.matchId : undefined);
        if (!mId) return false;
        const result = finishedMatchResults.get(mId);
        if (!result) return false;
        const ht =
          typeof result.htHome === "number" && typeof result.htAway === "number"
            ? { htHome: result.htHome, htAway: result.htAway }
            : undefined;
        return (
          scoreOutcomeForSel(sel, result, ht, {
            status: result.status,
            cornersTotal: result.cornersTotal,
            cardsTotal: result.cardsTotal,
            firstGoal: result.firstGoal,
            extras: result.extras,
            finishedAt: result.finishedAt,
          }) === "lost"
        );
      });
      if (hasLostLeg) {
        const updatedSelsLost = selRecs.map((sel) => {
          const mId = sel.matchId ?? (isSingleLeg ? bet.matchId : undefined);
          if (!mId) return sel;
          const result = finishedMatchResults.get(mId);
          if (!result) return sel;
          const ht =
            typeof result.htHome === "number" &&
            typeof result.htAway === "number"
              ? { htHome: result.htHome, htAway: result.htAway }
              : undefined;
          return {
            ...sel,
            finalScore: { home: result.home, away: result.away },
            htScore: ht,
            outcome: scoreOutcomeForSel(sel, result, ht, {
              status: result.status,
              cornersTotal: result.cornersTotal,
              cardsTotal: result.cardsTotal,
              firstGoal: result.firstGoal,
              extras: result.extras,
              finishedAt: result.finishedAt,
            }),
          };
        });
        await db
          .update(betsTable)
          .set({ status: "lost", selections: updatedSelsLost })
          .where(eq(betsTable.id, bet.id));
        await db
          .delete(cashoutStatesTable)
          .where(eq(cashoutStatesTable.betId, bet.id));
        res.status(400).json({
          error: "Boletim já tem uma seleção perdida — cash out indisponível",
        });
        return;
      }

      const policy = await getCashoutPolicy();
      const [existingState] = await db
        .select({
          unfavorableSince: cashoutStatesTable.unfavorableSince,
          reason: cashoutStatesTable.reason,
        })
        .from(cashoutStatesTable)
        .where(eq(cashoutStatesTable.betId, bet.id))
        .limit(1);
      const cashoutDisabledEventIds = await getCashoutDisabledEventIdsForBets([
        bet as unknown as {
          matchId: string;
          matchTitle: string;
          selections: unknown;
          totalOdds: string;
        },
      ]);
      const calc = cashoutCalcForBet({
        bet: bet as unknown as {
          id?: number;
          matchId: string;
          matchTitle: string;
          selections: unknown;
          stake: string;
          totalOdds: string;
          status: string;
        },
        policy,
        existingState: existingState
          ? {
              unfavorableSince: existingState.unfavorableSince,
              reason: existingState.reason,
            }
          : null,
        cashoutDisabledEventIds,
      });

      if (calc.stateOp.type === "insert") {
        await db
          .insert(cashoutStatesTable)
          .values({
            betId: bet.id,
            unfavorableSince: calc.stateOp.since,
            reason: calc.stateOp.reason,
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
      } else if (calc.stateOp.type === "update_reason") {
        await db
          .update(cashoutStatesTable)
          .set({ reason: calc.stateOp.reason, updatedAt: new Date() })
          .where(eq(cashoutStatesTable.betId, bet.id));
      } else if (calc.stateOp.type === "delete") {
        await db
          .delete(cashoutStatesTable)
          .where(eq(cashoutStatesTable.betId, bet.id));
      }

      if (
        calc.info.cashoutStatus !== "available" ||
        !calc.info.cashoutEstimate
      ) {
        const reason =
          calc.info.cashoutStatus === "suspended"
            ? `Cash out suspenso — ${calc.info.cashoutReason ?? "LANCE CRÍTICO"}. Aguarde e tente novamente.`
            : "Cash out indisponível no momento.";
        res.status(400).json({ error: reason });
        return;
      }

      const cashoutStr = calc.info.cashoutEstimate;
      const cashoutValue = parseFloat(cashoutStr);

      const result = await db.transaction(async (tx: any) => {
        // Atomic cashout — prevent double cashout via concurrent requests
        // by making status = 'cashed_out' only if still 'pending'
        const updatedBet = await tx
          .update(betsTable)
          .set({ status: "cashed_out", cashoutValue: cashoutStr })
          .where(and(eq(betsTable.id, betId), eq(betsTable.status, "pending")))
          .returning({ id: betsTable.id });

        if (updatedBet.length === 0) {
          throw Object.assign(new Error("Bet is not eligible for cash out"), {
            status: 400,
          });
        }

        await applyBalanceDelta(tx, {
          userId: authReq.user!.id,
          amount: cashoutStr,
          kind: "bet_cashout_payout",
          idempotencyKey: `bet:${betId}:cashout`,
          refType: "bet",
          refId: String(betId),
        });

        await tx
          .insert(settlementLogsTable)
          .values({
            settlementKey: `bet:${betId}:old:pending:new:cashed_out:event:cashout`,
            betId,
            userId: authReq.user!.id,
            oldStatus: "pending",
            newStatus: "cashed_out",
            payout: cashoutStr,
            message: "Cashout",
          })
          .onConflictDoNothing();

        await tx
          .delete(cashoutStatesTable)
          .where(eq(cashoutStatesTable.betId, betId));

        return { cashoutValue };
      });

      res.json(result);
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      logger.error({ err }, "Cashout error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
