import { logger } from "../../lib/logger.js";
import type { ProviderRawOddsSelection, GoalServeCanonicalOutcome } from "./types.js";

export function stripBom(text: string): string {
  if (!text) return "";
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  if (text.startsWith("\\ufeff")) return text.slice(6);
  if (text.length >= 3 && text.charCodeAt(0) === 0xef && text.charCodeAt(1) === 0xbb && text.charCodeAt(2) === 0xbf) {
    return text.slice(3);
  }
  return text;
}

export function flattenAtAttributes(obj: any): any {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(flattenAtAttributes);
  if (typeof obj !== "object") return obj;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (k.startsWith("@")) {
      const nk = k.slice(1);
      if (!(nk in out)) out[nk] = typeof v === "string" ? v : flattenAtAttributes(v);
    } else {
      out[k] = flattenAtAttributes(v);
    }
  }
  return out;
}

export type GoalServeUnpackedRoot = {
  categories: any[];
  ts?: string | number;
  sport?: string;
};

export function unpackGoalServeRoot(rawRoot: any): GoalServeUnpackedRoot {
  const step1 = rawRoot?.scores ?? rawRoot?.score ?? rawRoot?.odds ?? rawRoot?.data ?? rawRoot;
  const step2 = flattenAtAttributes(step1 ?? {});
  const categoriesRaw = step2?.category ?? step2?.league ?? step2?.leagues ?? step2?.odds ?? step2?.tournaments ?? step2;
  const catsList = coerceArray<any>(categoriesRaw);
  const flat: any[] = [];
  for (const cat of catsList) {
    flat.push(flattenAtAttributes(cat));
  }
  return {
    categories: flat,
    ts: (rawRoot?.scores ?? rawRoot)?.ts ?? (rawRoot?.scores ?? rawRoot)?.["@ts"] ?? step2?.ts ?? step2?.updated_ts ?? undefined,
    sport: step2?.sport ?? (rawRoot?.scores && rawRoot.scores["@sport"]) ?? undefined,
  };
}

export function extractMatchesFromCategory(cat: any): any[] {
  const c = flattenAtAttributes(cat ?? {});
  const candidates: any[] = [];
  const matchesBox = c?.matches ?? c?.match ?? c?.games ?? c?.events;
  if (Array.isArray(matchesBox)) {
    for (const m of matchesBox) candidates.push(flattenAtAttributes(m));
  } else if (matchesBox && typeof matchesBox === "object") {
    const inner = matchesBox?.match ?? matchesBox?.matches ?? matchesBox?.game ?? matchesBox?.event;
    for (const m of coerceArray<any>(inner)) candidates.push(flattenAtAttributes(m));
  }
  const league = c?.name ?? c?.league ?? c?.league_name ?? c?.category ?? "";
  const country = c?.country ?? c?.country_name ?? "";
  const gid = c?.gid ? String(c.gid) : undefined;
  const lid = c?.id ? String(c.id) : undefined;
  if (!league && !country) return candidates;
  return candidates.map((m) => ({
    ...m,
    league: m?.league ?? league,
    country: m?.country ?? country,
    ...(gid && !m?.league_gid ? { league_gid: gid } : {}),
    ...(lid && !m?.league_id ? { league_id: lid } : {}),
  }));
}

export function pickTeamName(raw: any): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw !== "object") return String(raw ?? "").trim();
  const o = flattenAtAttributes(raw);
  const n = o?.name ?? o?.Name ?? o?.title ?? o?.team_name ?? o?.team ?? o?.club;
  if (typeof n === "string") return n.trim();
  return "";
}

export function pickTeamId(raw: any): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object") return undefined;
  const o = flattenAtAttributes(raw);
  const id = o?.id ?? o?.team_id ?? o?.Id ?? undefined;
  return id === undefined || id === null || String(id).trim() === "" ? undefined : String(id);
}

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
