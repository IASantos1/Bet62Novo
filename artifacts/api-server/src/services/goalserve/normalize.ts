import { logger } from "../../lib/logger.js";
import type { ProviderRawOddsSelection, GoalServeCanonicalOutcome } from "./types.js";

export function looksOkOddString(raw: string | number | undefined | null): boolean {
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim();
  if (!s) return false;
  if (s.includes(":") || s.includes("/")) return false;
  const n = Number(s);
  if (!Number.isFinite(n)) return false;
  if (n < 1.01 || n > 1000) return false;
  return true;
}

export function parseOddDecimal(raw: string | number | undefined | null): number | null {
  if (!looksOkOddString(raw)) return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Number(n.toFixed(3)) : null;
}

export function extractLineNumberFromLabel(label: string | number | undefined | null): number | null {
  if (label === undefined || label === null) return null;
  const s = String(label).replace(/,/g, ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function parseCorrectScoreFromLabel(
  label: string | undefined | null,
): { home: number; away: number } | null {
  if (!label) return null;
  const s = String(label).trim();
  const m = s.match(/^(\d+)\s*[-:x]\s*(\d+)$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const a = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { home: h, away: a };
}

export function formatCorrectScoreKey(h: number, a: number): string {
  return `${h}-${a}`;
}

export function parseGoalServeDDMMYYYY(
  date: string | undefined | null,
  time: string | undefined | null,
): { iso: string; tsSec: number } | null {
  if (!date) return null;
  const d = String(date).trim();
  const t = time ? String(time).trim() : "00:00";
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) {
    const fallback = new Date(`${d}T${t}`);
    if (!Number.isFinite(fallback.getTime())) return null;
    return { iso: fallback.toISOString(), tsSec: Math.floor(fallback.getTime() / 1000) };
  }
  const day = Number(m[1]);
  const mon = Number(m[2]) - 1;
  const year = Number(m[3]);
  const [hh, mm] = t.split(":").map((x) => Number(x || 0));
  const dt = new Date(year, mon, day, hh || 0, mm || 0, 0, 0);
  if (!Number.isFinite(dt.getTime())) return null;
  return { iso: dt.toISOString(), tsSec: Math.floor(dt.getTime() / 1000) };
}

export function parseISO8601Any(
  raw: string | number | undefined | null,
): { iso: string; tsSec: number } | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const ms = typeof raw === "number" ? (raw > 1e12 ? raw : raw * 1000) : new Date(String(raw)).getTime();
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), tsSec: Math.floor(ms / 1000) };
}

export type MarketHint = {
  market: "1X2" | "OU" | "AH" | "DC" | "BTTS" | "CS" | string;
  lineMaybe?: number;
  outcomeMaybe?: GoalServeCanonicalOutcome;
};

export function guessMarketFromGoalServeNames(rawMarket: string, rawOddName: string): MarketHint {
  const m = String(rawMarket || "").toLowerCase();
  const n = String(rawOddName || "").toLowerCase();
  const line = extractLineNumberFromLabel(n) ?? extractLineNumberFromLabel(rawMarket);
  if (m.includes("correct score") || m.includes("exact score") || m === "cs") {
    return { market: "CS", outcomeMaybe: "CORRECT_SCORE" };
  }
  if (m.includes("btts") || m.includes("both teams to score") || m.includes("bts")) {
    if (n.includes("yes") || n.includes("sim")) return { market: "BTTS", outcomeMaybe: "BTTS_YES" };
    if (n.includes("no") || n.includes("nao") || n.includes("não"))
      return { market: "BTTS", outcomeMaybe: "BTTS_NO" };
    return { market: "BTTS" };
  }
  if (m.includes("double chance") || m.includes("dupla hipotese") || m === "dc") {
    if (/1x|1x$|home.*draw/.test(n)) return { market: "DC", outcomeMaybe: "DOUBLE_1X" };
    if (/x2|x2$|draw.*away/.test(n)) return { market: "DC", outcomeMaybe: "DOUBLE_X2" };
    if (/12|12$|home.*away/.test(n)) return { market: "DC", outcomeMaybe: "DOUBLE_12" };
    return { market: "DC" };
  }
  if (m.includes("over/under") || m.includes("total goals") || /^ou[\s_-]?\d/.test(m) || m === "total") {
    if (n.startsWith("over") || n.startsWith("mais") || n.includes("acima"))
      return { market: "OU", lineMaybe: line, outcomeMaybe: "OVER" };
    if (n.startsWith("under") || n.startsWith("menos") || n.includes("abaixo"))
      return { market: "OU", lineMaybe: line, outcomeMaybe: "UNDER" };
    return { market: "OU", lineMaybe: line };
  }
  if (m.includes("handicap") || m.startsWith("ah") || /^asian/.test(m)) {
    return { market: "AH", lineMaybe: line };
  }
  if (/1x2|full.?time.?result|match.?winner|3?way|resultado final/.test(m) || m === "ft" || m === "") {
    if (/^1$|home|casa|1\b/.test(n)) return { market: "1X2", outcomeMaybe: "HOME" };
    if (/^x$|draw|empate|d\b/.test(n)) return { market: "1X2", outcomeMaybe: "DRAW" };
    if (/^2$|away|fora|visitante|2\b/.test(n)) return { market: "1X2", outcomeMaybe: "AWAY" };
    return { market: "1X2" };
  }
  return { market: m };
}

export function coerceArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

export function warnOnceFactory(tag: string) {
  const seen = new Set<string>();
  return (key: string, extra?: any) => {
    if (seen.has(key)) return;
    seen.add(key);
    logger.warn({ tag, key, extra }, "[goalserve] adapt: shape nova, normalizacao possivelmente incompleta");
  };
}
