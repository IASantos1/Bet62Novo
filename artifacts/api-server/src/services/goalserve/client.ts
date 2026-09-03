// Cliente HTTP partilhado para GoalServe feeds (scores, odds, livescore,
// settlement, logos). Peculiaridade documentada (ver user docs colados):
// o path /getodds/soccer É O MESMO PARA TODOS OS DESPORTOS; só muda o
// query-param `cat=<sport>_10` (ex: cat=basket_10, cat=tennis_10, etc.).
// Throttle global 1 req/s (todos os endpoints partilham o mesmo limite),
// Accept-Encoding: gzip obrigatório (feeds são grandes sem filtro), e
// suporte a incrementalismo por `ts` no root das feeds de odds.
import zlib from "node:zlib";
import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export const GOALSERVE_SETTLE_SPORTID: Record<string, number> = {
  soccer: 4,
  basketball: 7,
  tennis: 5,
};

export const MIN_REQUEST_GAP_MS = 1_050;
const globalChain: { p: Promise<void> } = { p: Promise.resolve() };
let lastRequestAt = 0;

async function throttleGlobal(): Promise<void> {
  const previous = globalChain.p;
  const next = previous.then(async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  globalChain.p = next;
  return next;
}

function appendQuery(url: string, extra: Record<string, string | number | undefined | null>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  if (!u.searchParams.has("json")) u.searchParams.set("json", "1");
  return u.toString();
}

function goalServeKey(): string {
  if (!CONFIG.GOALSERVE_API_KEY) {
    logger.warn("[goalserve] GOALSERVE_API_KEY vazia — chamadas vão falhar com 401/403");
  }
  return CONFIG.GOALSERVE_API_KEY;
}

export function goalServeFeedUrl(
  feedPath: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const base = `${CONFIG.GOALSERVE_BASE_URL}/${encodeURIComponent(goalServeKey())}/${feedPath}`;
  return appendQuery(base, params ?? {});
}

export function goalServeLivescoreUrl(
  sport: string,
  subpath: "home" | "live",
  params?: Record<string, string | number | undefined | null>,
): string {
  const base = `${CONFIG.GOALSERVE_LIVESCORE_BASE}/${encodeURIComponent(
    sport,
  )}/${encodeURIComponent(subpath)}?apiKey=${encodeURIComponent(goalServeKey())}`;
  return appendQuery(base, params ?? {});
}

export function goalServeOddsUrl(
  sportCategory: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const base = `${CONFIG.GOALSERVE_BASE_URL}/${encodeURIComponent(
    goalServeKey(),
  )}/getodds/soccer?cat=${encodeURIComponent(sportCategory)}_10`;
  return appendQuery(base, params ?? {});
}

export function goalServeSettlementsUrl(opts: {
  sportId: number;
  dateTime?: number;
  matchesIds?: string;
  json?: 0 | 1;
}): string {
  const { sportId, dateTime, matchesIds, json = 1 } = opts;
  const base = `${CONFIG.GOALSERVE_ODDSSETTLE_BASE}/odds/pre-game/settlements?sportId=${encodeURIComponent(
    sportId,
  )}&k=${encodeURIComponent(goalServeKey())}&json=${json}`;
  return appendQuery(base, { dateTime, matchesIds: matchesIds ?? undefined });
}

export function goalServeSettlementSingleUrl(opts: {
  sportId: number;
  gsId: string | number;
  marketId: number;
  oddname: string;
}): string {
  const { sportId, gsId, marketId, oddname } = opts;
  return `${CONFIG.GOALSERVE_ODDSSETTLE_BASE}/odds/pre-game/settlement?sportId=${encodeURIComponent(
    sportId,
  )}&gsId=${encodeURIComponent(gsId)}&marketId=${encodeURIComponent(
    marketId,
  )}&oddname=${encodeURIComponent(oddname)}&k=${encodeURIComponent(goalServeKey())}&json=1`;
}

export function goalServeLogoUrl(
  sport:
    | "soccer"
    | "basketball"
    | "baseball"
    | "amfootball"
    | "hockey"
    | "cricket"
    | "golf"
    | "rugby_union"
    | "rugby_league",
  category: "leagues" | "teams" | "players",
  ids: string[],
): string {
  return `http://data2.goalserve.com:8084/api/v1/logotips/${encodeURIComponent(
    sport,
  )}/${encodeURIComponent(category)}?k=${encodeURIComponent(goalServeKey())}&ids=${encodeURIComponent(
    ids.join(","),
  )}`;
}

export type GoalServeSettleResult = "Win" | "Loose" | "Stake refund" | "Half win" | "Half loose";

export type GoalServeFeedRoot<T = unknown> = T & {
  ts?: string | number;
  sport?: string;
};

async function gunzipIfNeeded(resp: Response): Promise<Buffer> {
  const arr = new Uint8Array(await resp.arrayBuffer());
  const raw = Buffer.from(arr);
  const ce = resp.headers.get("content-encoding") ?? "";
  const markedGzip = ce.toLowerCase().includes("gzip");
  if (!markedGzip && raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    logger.debug("[goalserve] content-encoding missing but magic bytes are gzip");
  }
  const tryGunzip = markedGzip || (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);
  if (!tryGunzip) return raw;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      zlib.gunzip(raw, (err, buf) => (err ? reject(err) : resolve(buf)));
    });
  } catch (err: any) {
    if (err && err.code === "Z_DATA_ERROR") {
      logger.debug(
        { code: err.code, errno: err.errno, len: raw.length },
        "[goalserve] gzip decompress failed (Z_DATA_ERROR) — returning raw as plain utf8 (proxy-decompressed or server-side plain)",
      );
      return raw;
    }
    throw err;
  }
}

async function goalServeFetchRaw<T>(
  url: string,
  timeoutMs = 15_000,
): Promise<T> {
  if (!CONFIG.ENABLE_GOALSERVE) {
    throw new Error("[goalserve] killswitch ENABLE_GOALSERVE=false — no network");
  }
  await throttleGlobal();
  const resp = await fetch(url, {
    headers: { "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new Error(`[goalserve] ${resp.status} on ${url.replace(goalServeKey(), "<KEY>")}`);
  }
  const buf = await gunzipIfNeeded(resp);
  const text = buf.toString("utf8");
  let data: T;
  try {
    data = JSON.parse(text);
  } catch (err) {
    logger.warn(
      { err, url: url.replace(goalServeKey(), "<KEY>"), sample: text.slice(0, 200) },
      "[goalserve] JSON parse failed",
    );
    throw err;
  }
  const gt = (globalThis as any).__lastFetchTs ?? {};
  gt.goalserve = Date.now();
  (globalThis as any).__lastFetchTs = gt;
  return data;
}

export async function goalServeGet<T>(
  url: string,
  timeoutMs = 15_000,
): Promise<T> {
  return goalServeFetchRaw<T>(url, timeoutMs);
}

export async function goalServeGetWithRetry<T>(
  url: string,
  opts?: { timeoutMs?: number; retries?: number; retryDelayMs?: number },
): Promise<T | null> {
  if (!CONFIG.ENABLE_GOALSERVE) return null;
  const retries = opts?.retries ?? 3;
  const baseDelay = opts?.retryDelayMs ?? 1500;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await goalServeGet<T>(url, opts?.timeoutMs);
    } catch (err) {
      if (attempt === retries) {
        logger.warn(
          { err, url: url.replace(goalServeKey(), "<KEY>") },
          "[goalserve] giving up after retries",
        );
        return null;
      }
      await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)));
    }
  }
  return null;
}
