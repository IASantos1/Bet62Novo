import type { JsonRecord } from "../goal/client.js";
import { unwrapPropLine } from "./client.js";

export type PropLineEvent = {
  id: string;
  sportKey: string;
  sport: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  league: string;
  country: string;
  kickoffUtc?: string;
  status: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  raw: JsonRecord;
};

export type NormalizedMarket = {
  bookmaker: string;
  market: string;
  period?: string;
  line?: number;
  selection: string;
  selectionId?: string;
  oddsDecimal: number;
  status: "OPEN" | "SUSPENDED" | "CLOSED";
  sourceTimestamp: number;
  receivedTimestamp: number;
};

const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
const text = (...values: unknown[]): string => {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
};
const numberValue = (...values: unknown[]): number => {
  for (const value of values) {
    const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};
const optionalNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};
const toArray = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(record) : value ? [record(value)] : [];

export function normalizePropLineEvent(value: unknown, sportFallback = ""): PropLineEvent | null {
  const raw = record(value);
  const homeRoot = record(raw["home"] ?? raw["homeTeam"] ?? raw["home_team"] ?? raw["participant1"]);
  const awayRoot = record(raw["away"] ?? raw["awayTeam"] ?? raw["away_team"] ?? raw["participant2"]);
  const home = text(homeRoot["name"], raw["home_team"], raw["homeName"], raw["home_team_name"]);
  const away = text(awayRoot["name"], raw["away_team"], raw["awayName"], raw["away_team_name"]);
  const id = text(raw["id"], raw["eventId"], raw["event_id"], raw["fixtureId"], raw["fixture_id"]);
  if (!id || !home || !away) return null;
  const leagueRoot = record(raw["league"] ?? raw["competition"] ?? raw["tournament"]);
  return {
    id,
    sportKey: text(raw["_propLineSportKey"], raw["sport_key"], raw["sportKey"]),
    sport: sportFallback || text(raw["sport"], raw["sportKey"], raw["sport_key"]) || "other",
    home,
    away,
    homeTeamId: text(homeRoot["id"], raw["homeTeamId"], raw["home_team_id"]) || undefined,
    awayTeamId: text(awayRoot["id"], raw["awayTeamId"], raw["away_team_id"]) || undefined,
    league: text(raw["_propLineSportTitle"], leagueRoot["name"], raw["leagueName"], raw["competitionName"], raw["sport_key"]) || "Unknown",
    country: text(record(leagueRoot["country"])["name"], raw["country"], raw["region"]) || "International",
    kickoffUtc: text(raw["kickoff"], raw["kickoffUtc"], raw["startTime"], raw["start_time"], raw["commenceTime"], raw["commence_time"]) || undefined,
    status: raw["live"] === true ? "LIVE" : text(raw["status"], raw["state"], raw["phase"]) || "NS",
    homeScore: numberValue(record(raw["score"])["home"], raw["homeScore"], raw["home_score"], homeRoot["score"]),
    awayScore: numberValue(record(raw["score"])["away"], raw["awayScore"], raw["away_score"], awayRoot["score"]),
    minute: numberValue(raw["minute"], raw["elapsed"], record(raw["clock"])["minute"]),
    raw,
  };
}

export function normalizePropLineEvents(value: unknown, sportFallback = ""): PropLineEvent[] {
  return unwrapPropLine(value).map((item) => normalizePropLineEvent(item, sportFallback)).filter((item): item is PropLineEvent => Boolean(item));
}

function parseStatus(value: unknown): "OPEN" | "SUSPENDED" | "CLOSED" {
  const v = String(value ?? "").toLowerCase();
  if (/(suspend|halt|pause)/.test(v)) return "SUSPENDED";
  if (/(closed|close|removed|unavailable)/.test(v)) return "CLOSED";
  return "OPEN";
}

function sourceTime(raw: JsonRecord): number {
  const value = raw["sourceTimestamp"] ?? raw["source_timestamp"] ?? raw["timestamp"] ??
    raw["book_updated_at"] ?? raw["last_update"] ?? raw["last_seen_at"] ??
    raw["updatedAt"] ?? raw["updated_at"];
  const asNumber = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(asNumber) && asNumber > 0 ? (asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber) : 0;
}

function outcomeRows(raw: JsonRecord): JsonRecord[] {
  return toArray(raw["outcomes"] ?? raw["selections"] ?? raw["lines"] ?? raw["prices"] ?? raw["odds"]);
}

export function normalizePropLineOdds(value: unknown, receivedTimestamp = Date.now()): NormalizedMarket[] {
  const result: NormalizedMarket[] = [];
  const visit = (node: unknown, bookmaker = "", inheritedTimestamp = 0, inheritedSuspended = false): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, bookmaker, inheritedTimestamp, inheritedSuspended);
      return;
    }
    if (!node || typeof node !== "object") return;
    const raw = node as JsonRecord;
    const bookmakerNode = Array.isArray(raw["markets"]);
    const nextBookmaker = text(
      raw["bookmaker"],
      raw["bookmakerName"],
      raw["book"],
      bookmakerNode ? raw["title"] : undefined,
      bookmakerNode ? raw["key"] : undefined,
      bookmaker,
    ) || "unknown";
    const timestamp = sourceTime(raw) || inheritedTimestamp;
    const suspended = inheritedSuspended || Boolean(raw["suspended_at"]) || raw["active"] === false;
    const marketName = text(raw["market"], raw["marketName"], raw["key"], raw["name"], raw["type"]);
    const rows = outcomeRows(raw);
    if (marketName && rows.length) {
      for (const row of rows) {
        const decimalValue = optionalNumber(row["oddsDecimal"], row["decimal"]);
        const rawPrice = optionalNumber(row["price"], row["odds"], row["value"]);
        const odds = decimalValue ?? (
          rawPrice == null ? 0 :
          rawPrice >= 100 ? 1 + rawPrice / 100 :
          rawPrice <= -100 ? 1 + 100 / Math.abs(rawPrice) :
          rawPrice
        );
        if (!Number.isFinite(odds) || odds <= 1.001 || odds > 1000) continue;
        const status = suspended ? "SUSPENDED" : parseStatus(row["status"] ?? raw["status"]);
        const outcomeTimestamp = sourceTime(row) || timestamp;
        result.push({
          bookmaker: nextBookmaker,
          market: marketName,
          period: text(row["period"], raw["period"], raw["gamePeriod"], raw["segment"]) || undefined,
          line: optionalNumber(row["line"], row["point"], row["handicap"], raw["line"], raw["point"]),
          selection: text(row["selection"], row["name"], row["label"], row["outcome"], row["side"], row["key"]),
          selectionId: text(row["id"], row["selectionId"], row["selection_id"]) || undefined,
          oddsDecimal: odds,
          status,
          sourceTimestamp: outcomeTimestamp,
          receivedTimestamp,
        });
      }
    }
    for (const key of ["bookmakers", "markets", "odds", "data", "items"]) {
      if (raw[key] !== undefined && raw[key] !== node) visit(raw[key], nextBookmaker, timestamp, suspended);
    }
  };
  visit(value);
  return result.filter((row) => row.selection);
}

export function freshestOpenMarkets(markets: NormalizedMarket[], maxAgeMs = 45_000): NormalizedMarket[] {
  const now = Date.now();
  return markets.filter((market) =>
    market.status === "OPEN" &&
    Number.isFinite(market.oddsDecimal) &&
    market.oddsDecimal > 1.001 &&
    now - market.sourceTimestamp <= maxAgeMs,
  );
}