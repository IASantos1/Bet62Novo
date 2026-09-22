import type { JsonRecord } from "./client.js";
import { getGoalFixtureResource, unwrapGoalCollection } from "./client.js";

export type GoalEvent = {
  id: string;
  type: string;
  team: "home" | "away" | "none";
  minute: number;
  player: string;
  playerId?: string;
  detail?: string;
  assistName?: string;
};

export type GoalFixture = {
  id: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  league: string;
  country: string;
  leagueId?: string;
  kickoffUtc?: string;
  homeScore: number;
  awayScore: number;
  status: string;
  minute: number;
  stadium?: string;
  referee?: string;
  events: GoalEvent[];
  statistics: JsonRecord[];
  commentary: Array<{ id: string; time: string; text: string }>;
  raw: JsonRecord;
};

const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const text = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
};

const numberValue = (...values: unknown[]): number => {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

function team(raw: unknown): JsonRecord {
  return record(raw);
}

function score(raw: JsonRecord, side: "home" | "away"): number {
  const scoreRoot = record(raw["score"] ?? raw["scores"] ?? raw["result"]);
  const sideRoot = record(raw[side] ?? scoreRoot[side]);
  return numberValue(
    sideRoot["score"],
    sideRoot["goals"],
    sideRoot["current"],
    scoreRoot[side],
    raw[`${side}TeamScore`],
    raw[`${side}Score`],
    raw[`${side}_score`],
  );
}

function mapStatus(raw: JsonRecord): string {
  const value = text(raw["status"], raw["state"], raw["phase"], raw["matchStatus"]);
  const normalized = value.toLowerCase();
  if (/(finished|ended|final|full.?time|ft|completed)/i.test(normalized)) return "FT";
  if (/(half.?time|halftime|ht|break)/i.test(normalized)) return "HT";
  if (/(postpon|cancel|abandon|suspend)/i.test(normalized)) return "Interrompido";
  if (/(live|in.?play|playing|first.?half|second.?half|extra)/i.test(normalized)) return value || "LIVE";
  return value || "NS";
}

function mapEvents(raw: unknown, homeId?: string, awayId?: string): GoalEvent[] {
  return unwrapGoalCollection(raw).map((item, index) => {
    const eventType = text(item["type"], item["eventType"], item["incidentType"], item["kind"], item["name"]) || "event";
    const teamRaw = text(item["team"], item["teamSide"], item["side"], item["participant"]);
    const teamId = text(item["teamId"], item["participantId"]);
    const side: GoalEvent["team"] =
      teamId && teamId === homeId || /home|host|1\b/i.test(teamRaw) ? "home" :
      teamId && teamId === awayId || /away|guest|2\b/i.test(teamRaw) ? "away" : "none";
    return {
      id: text(item["id"], item["eventId"], `${eventType}-${index}`),
      type: eventType.toLowerCase(),
      team: side,
      minute: numberValue(item["minute"], item["time"], item["elapsed"], item["matchMinute"]),
      player: text(item["player"], item["playerName"], item["scorer"], item["name"]),
      playerId: text(item["playerId"], item["player_id"]) || undefined,
      detail: text(item["detail"], item["description"], item["comment"]) || undefined,
      assistName: text(item["assist"], item["assistName"], item["assist_name"]) || undefined,
    };
  });
}

export function normalizeGoalFixture(input: unknown): GoalFixture | null {
  const raw = record(input);
  const homeRoot = team(raw["homeTeam"] ?? raw["home"] ?? raw["home_team"] ?? raw["team1"]);
  const awayRoot = team(raw["awayTeam"] ?? raw["away"] ?? raw["away_team"] ?? raw["team2"]);
  const home = text(homeRoot["name"], raw["homeTeamName"], raw["homeName"], raw["home_team_name"]);
  const away = text(awayRoot["name"], raw["awayTeamName"], raw["awayName"], raw["away_team_name"]);
  const id = text(raw["id"], raw["fixtureId"], raw["fixture_id"], raw["matchId"], raw["match_id"]);
  if (!id || !home || !away) return null;
  const competition = record(raw["competition"] ?? raw["league"] ?? raw["tournament"]);
  const countryRoot = record(competition["country"] ?? raw["country"]);
  const kickoff = text(raw["kickoff"], raw["kickoffUtc"], raw["kickoff_utc"], raw["startTime"], raw["start_time"], raw["dateTime"], raw["datetime"], raw["date"]);
  const minute = numberValue(
    raw["matchMinute"],
    raw["matchElapsed"],
    raw["minute"],
    raw["elapsed"],
    record(raw["clock"])["minute"],
    record(raw["time"])["minute"],
  );
  return {
    id,
    home,
    away,
    homeTeamId: text(homeRoot["id"], raw["homeTeamId"], raw["home_team_id"]) || undefined,
    awayTeamId: text(awayRoot["id"], raw["awayTeamId"], raw["away_team_id"]) || undefined,
    league: text(competition["name"], raw["leagueName"], raw["league_name"]) || "Football",
    country: text(countryRoot["name"], raw["countryName"], raw["country_name"], raw["country"]) || "International",
    leagueId: text(competition["id"], raw["leagueId"], raw["league_id"]) || undefined,
    kickoffUtc: kickoff || undefined,
    homeScore: score(raw, "home"),
    awayScore: score(raw, "away"),
    status: mapStatus(raw),
    minute,
    stadium: text(record(raw["venue"] ?? raw["stadium"])["name"], raw["matchStadium"], raw["stadium"]) || undefined,
    referee: text(record(raw["referee"])["name"], raw["matchReferee"], raw["referee"]) || undefined,
    events: mapEvents(raw["events"] ?? raw["incidents"] ?? raw["event"], text(homeRoot["id"]), text(awayRoot["id"])),
    statistics: unwrapGoalCollection(raw["statistics"] ?? raw["stats"]),
    commentary: unwrapGoalCollection(raw["commentary"]).map((item, index) => ({
      id: text(item["id"], item["eventId"], `commentary-${index}`),
      time: text(item["time"], item["minute"], item["timestamp"]),
      text: text(item["text"], item["commentary"], item["description"], item["message"]),
    })).filter((item) => item.text),
    raw,
  };
}

export async function enrichGoalFixture(fixture: GoalFixture, live: boolean): Promise<GoalFixture> {
  if (!live) return fixture;
  const [eventsRaw, statsRaw, commentaryRaw] = await Promise.all([
    getGoalFixtureResource(fixture.id, "events"),
    getGoalFixtureResource(fixture.id, "statistics"),
    getGoalFixtureResource(fixture.id, "commentary"),
  ]);
  const eventFixture = normalizeGoalFixture({ ...fixture.raw, id: fixture.id, events: eventsRaw }) ?? fixture;
  const statisticsRoot = record(record(statsRaw)["data"] ?? statsRaw);
  const matchStatistics = record(statisticsRoot["match"]);
  const statistics = [
    ...toStatRows(matchStatistics["fullTime"]),
    ...toStatRows(matchStatistics["firstHalf"], "1ª parte"),
    ...toStatRows(matchStatistics["secondHalf"], "2ª parte"),
  ];
  return {
    ...fixture,
    events: eventFixture.events.length ? eventFixture.events : fixture.events,
    statistics: statistics.length ? statistics : fixture.statistics,
    commentary: unwrapGoalCollection(commentaryRaw).map((item, index) => ({
      id: text(item["id"], item["eventId"], `commentary-${index}`),
      time: text(item["time"], item["minute"], item["timestamp"]),
      text: text(item["text"], item["commentary"], item["description"], item["message"]),
    })).filter((item) => item.text),
  };
}

function toStatRows(value: unknown, period?: string): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .filter((row) => text(row["type"], row["name"]))
    .map((row) => ({
      name: period ? `${text(row["type"], row["name"])} (${period})` : text(row["type"], row["name"]),
      home: row["home"],
      away: row["away"],
    }));
}

export function normalizeGoalFixtures(value: unknown): GoalFixture[] {
  return unwrapGoalCollection(value).map(normalizeGoalFixture).filter((item): item is GoalFixture => Boolean(item));
}