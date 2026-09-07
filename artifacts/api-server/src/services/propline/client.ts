// Shared HTTP plumbing for the PropLine odds API (api.prop-line.com) — 4th
// candidate to feed real sportsbook odds into this app, after Statyx (no
// game-level soccer market), TheRundown (dropped before any real endpoint
// beyond /sports) and Bet365Soft (removed 2026-09-07 — no dedicated
// results/settlement endpoint could be found; football ended up with no
// real data source at all).
//
// Confirmed real 2026-09-07 (unlike every earlier candidate, no doc-vs-
// reality mismatch found so far):
//   GET /v1/sports → flat array [{key, title, active}], includes
//     {"key":"soccer_brasileirao","title":"Brasileirão","active":true}.
//   GET /v1/sports/soccer_brasileirao/events → 21 real upcoming Série A
//     fixtures (Flamengo, Palmeiras, Corinthians, Vasco, ...), real
//     espn.soccer:<id> team ids, real dates. `bookmakers` is always null
//     here — this endpoint never carries odds (per its own docs).
//   GET /v1/sports/soccer_brasileirao/odds?markets=h2h,spreads,totals →
//     every one of those 21 events came back with a real "Result" (h2h)
//     market from 1-9 real bookmakers (Bovada, Pinnacle, BetMGM, Kalshi,
//     LowVig, Marathon, BetOnline, Rebet, Smarkets) — genuinely different
//     American-odds prices per book, not synthetic. `live` is a boolean
//     per event; there is no in-play score/clock field anywhere in this
//     response — PropLine is an odds+settlement API, not a live-score feed
//     (its own docs say only MLB/WNBA/NFL/NCAAF/NBA/NHL get near-real-time
//     (~90s) stat updates during play; every other sport, soccer included,
//     only updates once the game ends).
//
// Auth: `apikey` query param OR `X-API-Key` header (both documented) —
// using the header so the key never ends up in a logged URL.
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type PropLineErrorDetail = {
  error: string;
  message: string;
  required_tier?: string;
  upgrade_url?: string;
  retry_after_seconds?: number;
};

export class PropLineApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(`[propline] ${status}: ${message}`);
    this.name = "PropLineApiError";
    this.status = status;
    this.detail = detail;
  }
}

// Populated from response headers on every successful call — no confirmed
// fixed daily budget for the free tier yet, so callers can inspect this
// instead of assuming a number. Not persisted across restarts.
export let propLineQuota: {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  dailyResetAt: number | null; // unix seconds
  lastCheckedAt: number;
} = { dailyLimit: null, dailyRemaining: null, dailyResetAt: null, lastCheckedAt: 0 };

function propLineKey(): string {
  if (!CONFIG.PROPLINE_API_KEY) {
    logger.warn("[propline] PROPLINE_API_KEY vazia — chamadas vão falhar");
  }
  return CONFIG.PROPLINE_API_KEY;
}

function propLineUrl(path: string, params?: Record<string, string | number | undefined | null>): string {
  const url = new URL(`${CONFIG.PROPLINE_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function propLineFetch<T>(
  path: string,
  params: Record<string, string | number | undefined | null> | undefined,
  timeoutMs: number,
  opts?: { skipKillswitch?: boolean },
): Promise<T> {
  if (!CONFIG.ENABLE_PROPLINE && !opts?.skipKillswitch) {
    throw new Error("[propline] killswitch ENABLE_PROPLINE=false — no network");
  }
  const url = propLineUrl(path, params);
  const resp = await fetch(url, {
    headers: { "X-API-Key": propLineKey() },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const dailyLimit = Number(resp.headers.get("x-daily-limit"));
  const dailyRemaining = Number(resp.headers.get("x-daily-remaining"));
  const dailyReset = Number(resp.headers.get("x-daily-reset"));
  if (Number.isFinite(dailyLimit) || Number.isFinite(dailyRemaining)) {
    propLineQuota = {
      dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : propLineQuota.dailyLimit,
      dailyRemaining: Number.isFinite(dailyRemaining) ? dailyRemaining : propLineQuota.dailyRemaining,
      dailyResetAt: Number.isFinite(dailyReset) ? dailyReset : propLineQuota.dailyResetAt,
      lastCheckedAt: Date.now(),
    };
    if (Number.isFinite(dailyRemaining) && dailyRemaining < (dailyLimit || Infinity) * 0.1) {
      logger.warn({ dailyLimit, dailyRemaining }, "[propline] daily quota running low");
    }
  }

  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    logger.warn({ err, path, sample: text.slice(0, 200) }, "[propline] JSON parse failed");
    throw err;
  }
  if (!resp.ok) {
    const body = json as { detail?: PropLineErrorDetail } | null;
    const detail = body?.detail;
    throw new PropLineApiError(resp.status, detail?.message ?? resp.statusText, detail ?? json);
  }
  return json as T;
}

export async function propLineGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 10_000,
): Promise<T> {
  return propLineFetch<T>(path, params, timeoutMs);
}

// Bypasses ENABLE_PROPLINE — used only by a manual debug route so the
// integration can be explored against real responses while the feature
// itself is off in production. Still requires PROPLINE_API_KEY.
export async function propLineGetDebug<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 10_000,
): Promise<T> {
  return propLineFetch<T>(path, params, timeoutMs, { skipKillswitch: true });
}

// American → decimal odds. PropLine's `price` field is always American
// (confirmed real — e.g. +120/+230/+220, -148), same convention as
// Statyx used to require.
export function americanToDecimal(american: number): number {
  const decimal = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  return Math.round(decimal * 100) / 100;
}
