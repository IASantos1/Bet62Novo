// Shared, sport-agnostic (well — football is the only sport this provider
// covers) extraction helpers for GOAL API responses.
import type {
  GoalApiFixture,
  GoalApiOdds,
  GoalApiFixtureStatistics,
  GoalApiMatchEvent,
  GoalApiSubstitution,
  GoalApiLineups,
  GoalApiLineupTeam,
  GoalApiLineupEntry,
  GoalApiTopScorer,
  GoalApiTeamResults,
  GoalApiStanding,
  GoalApiStandingZones,
  GoalApiPlayer,
  GoalApiPlayerStatistics,
  GoalApiResultsStats,
} from "./index.js";

/** GOAL API's own English stat labels (match.fullTime[].type, confirmed
 * real 2026-09-09) mapped to the Portuguese labels this panel already
 * uses elsewhere. Only rows for a type in this map are shown — an
 * unrecognized type is skipped rather than surfaced with its raw English
 * name or fabricated. */
const GOAL_API_STAT_LABELS: Record<string, string> = {
  "Ball Possession": "Posse de bola",
  "On Target": "Remates à baliza",
  "Off Target": "Remates fora",
  Corners: "Cantos",
  Fouls: "Faltas",
  Attacks: "Ataques",
  "Dangerous Attacks": "Ataques perigosos",
  "Free Kick": "Livres",
  "Goal Kick": "Pontapé de baliza",
  "Throw In": "Lançamentos laterais",
  Penalty: "Grandes penalidades",
  Substitution: "Substituições",
  Offsides: "Fora de jogo",
  "Yellow Cards": "Cartões amarelos",
  "Red Cards": "Cartões vermelhos",
};

/** Shapes GOAL API's per-fixture statistics into the frontend's existing
 * generic stats-row renderer (home.tsx's V2StatsGroup type) — previously
 * fed by the deleted SportsAPI Pro V2 integration and hardcoded to an
 * empty array ever since.
 *
 * The real response (confirmed 2026-09-09) is a generic array of
 * provider-labelled {type,home,away} rows under match.fullTime, not the
 * fixed named fields ({shotsOnGoal,possession,corners,fouls}) originally
 * assumed here without ever checking a real response — this reads that
 * array directly instead. "Remates" (shots total) is derived by summing
 * On Target + Off Target the same way the old fixed-field version did. */
export function buildGoalApiMatchStats(
  stats: GoalApiFixtureStatistics | null | undefined,
): Array<{ title: string; rows: Array<{ name: string; home: string; away: string }> }> {
  const fullTime = stats?.match?.fullTime;
  if (!fullTime || fullTime.length === 0) return [];
  const byType = new Map(fullTime.map((row) => [row.type, row]));
  const rows: Array<{ name: string; home: string; away: string }> = [];
  const add = (name: string, home: unknown, away: unknown) => {
    if (home == null && away == null) return;
    rows.push({ name, home: home != null ? String(home) : "-", away: away != null ? String(away) : "-" });
  };

  const onTarget = byType.get("On Target");
  const offTarget = byType.get("Off Target");
  if (onTarget && offTarget) {
    const homeShots = Number(onTarget.home) + Number(offTarget.home);
    const awayShots = Number(onTarget.away) + Number(offTarget.away);
    if (Number.isFinite(homeShots) && Number.isFinite(awayShots)) add("Remates", homeShots, awayShots);
  }
  for (const row of fullTime) {
    const label = GOAL_API_STAT_LABELS[row.type];
    if (!label) continue;
    add(label, row.home, row.away);
  }
  if (rows.length === 0) return [];
  return [{ title: "Estatísticas do Jogo", rows }];
}

/** Parses GOAL API's "time" event field ("3", "45+2", "90+5") into a plain
 * minute number for sorting/display — stoppage-time minutes sort after
 * their own half but the "+N" part is dropped since the incident timeline
 * only ever showed a bare minute for every other provider. */
function parseGoalApiEventMinute(time: string): number {
  const n = Number.parseInt(time, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Maps GOAL API's raw match events (+ substitutions, a separate
 * documented endpoint — /fixtures/:id/substitutions) into the shape
 * routes/matches.ts's LiveMatchState.events field already expects (same
 * field every other provider in this file populates), sorted by minute so
 * the incident timeline reads chronologically regardless of which
 * endpoint contributed each entry.
 *
 * Only "GOAL" events have been observed in a real response so far — side
 * is derived from whichever of homeScorer/awayScorer is populated,
 * falling back to the "info" field ("home"/"away") when neither scorer
 * name was recorded; "info": "Penalty" is appended to the detail instead
 * of being treated as a side. */
export function buildGoalApiEvents(
  events: GoalApiMatchEvent[] | null | undefined,
  substitutions?: GoalApiSubstitution[] | null,
): Array<{ type: string; team: string; minute: number; player: string; playerId?: string; detail?: string }> {
  const fromEvents = (events ?? []).map((e) => {
    const team: "home" | "away" = e.homeScorer ? "home" : e.awayScorer ? "away" : e.info === "away" ? "away" : "home";
    const player = (team === "home" ? e.homeScorer : e.awayScorer) ?? "?";
    const playerId = (team === "home" ? e.homeScorerId : e.awayScorerId) ?? undefined;
    const assist = team === "home" ? e.homeAssist : e.awayAssist;
    const detailParts = [assist ? `Assistência: ${assist}` : null, e.info === "Penalty" ? "Grande Penalidade" : null].filter(
      (v): v is string => Boolean(v),
    );
    return {
      type: e.type === "GOAL" ? "goal" : e.type.toLowerCase(),
      team,
      minute: e.timeNum ?? parseGoalApiEventMinute(e.time),
      player,
      playerId,
      detail: detailParts.length > 0 ? detailParts.join(" · ") : undefined,
    };
  });
  const fromSubs = (substitutions ?? []).map((s) => ({
    type: "substitution",
    team: s.team,
    minute: s.minute,
    player: s.playerIn,
    detail: `Saiu: ${s.playerOut}`,
  }));
  return [...fromEvents, ...fromSubs].sort((a, b) => a.minute - b.minute);
}

/** Picks the first bookmaker entry that actually has a 1x2 price — GOAL
 * API's odds array is one entry per bookmaker, unlike PropLine's
 * per-bookmaker-markets-array-on-one-event shape. Returns null (never a
 * fabricated price) when no bookmaker has priced the match yet — matches
 * are un-priced for most of the ~72h before their PropLine-equivalent
 * odds-sync window per the provider's own docs ("odds pré-jogo são
 * sincronizadas a cada três horas, num período de três dias antes do
 * início da partida").
 *
 * Prices are the flat odd1/oddX/odd2 numeric-string fields (confirmed
 * real 2026-09-09) — an earlier pass assumed a nested "1x2" object that
 * never actually exists on this provider, so this market was silently
 * never extracted before. */
export function extractGoalApi1x2Odds(
  oddsList: GoalApiOdds[] | null | undefined,
): { home: number; draw: number; away: number } | null {
  if (!oddsList || oddsList.length === 0) return null;
  for (const entry of oddsList) {
    const home = Number(entry.odd1);
    const draw = Number(entry.oddX);
    const away = Number(entry.odd2);
    if (Number.isFinite(home) && Number.isFinite(draw) && Number.isFinite(away)) {
      return { home, draw, away };
    }
  }
  return null;
}

/** overUnder is a flat string->numeric-string map keyed by line ("o+2.5",
 * "u+2.5", ...) confirmed real 2026-09-09 — not one entry per line with
 * nested {over,under} fields as originally assumed. */
export function extractGoalApiOverUnder25(
  oddsList: GoalApiOdds[] | null | undefined,
): { over: number; under: number } | null {
  if (!oddsList || oddsList.length === 0) return null;
  for (const entry of oddsList) {
    const over = Number(entry.overUnder?.["o+2.5"]);
    const under = Number(entry.overUnder?.["u+2.5"]);
    if (Number.isFinite(over) && Number.isFinite(under)) {
      return { over, under };
    }
  }
  return null;
}

/** Both-teams-to-score is the flat btsYes/btsNo numeric-string pair
 * (confirmed real 2026-09-09), not a nested "bothTeamsToScore" object as
 * originally assumed. */
export function extractGoalApiBothTeamsToScore(
  oddsList: GoalApiOdds[] | null | undefined,
): { yes: number; no: number } | null {
  if (!oddsList || oddsList.length === 0) return null;
  for (const entry of oddsList) {
    const yes = Number(entry.btsYes);
    const no = Number(entry.btsNo);
    if (Number.isFinite(yes) && Number.isFinite(no)) return { yes, no };
  }
  return null;
}

export type BuiltLineupPlayer = { name: string; shortName?: string; position: string; number: string; rating?: number };
export type BuiltLineupTeam = { formation?: string; coach?: string; starters: BuiltLineupPlayer[]; bench: BuiltLineupPlayer[] };
export type BuiltLineups = { confirmed: boolean; home: BuiltLineupTeam; away: BuiltLineupTeam };

function buildLineupPlayer(entry: GoalApiLineupEntry): BuiltLineupPlayer {
  return {
    name: entry.lineupPlayer ?? "?",
    position: entry.lineupPosition ?? "",
    number: entry.lineupNumber != null ? String(entry.lineupNumber) : "",
  };
}

function buildLineupTeam(team: GoalApiLineupTeam | undefined, formationFallback?: string | null): BuiltLineupTeam {
  const starters = (team?.startingLineups ?? []).map(buildLineupPlayer);
  const bench = (team?.substitutes ?? []).map(buildLineupPlayer);
  const coach = team?.coach?.[0]?.lineupPlayer;
  return { formation: formationFallback ?? undefined, coach: coach ?? undefined, starters, bench };
}

/** Maps GOAL API's /fixtures/:id/lineups response into the frontend's
 * existing LineupsV2 shape (home.tsx) — previously fed by the deleted
 * SportsAPI Pro V2 integration and hardcoded to null ever since.
 *
 * The real envelope (confirmed 2026-09-09) splits each side into
 * startingLineups/substitutes/coach/missingPlayers arrays of one flat
 * entry shape ({lineupPlayer,lineupNumber,lineupPosition,...}), and
 * carries homeFormation/awayFormation itself rather than a per-team
 * "formation" field — this replaces an earlier, never-verified guess at
 * several plausible key names (startXI/starters, bench/substitutes,
 * nested {player:{...}}). "confirmed" maps to the API's own hasLineups
 * flag — the closest real signal to "lineup data exists for this
 * fixture" (there is no separate official-vs-provisional flag).
 * formationFallback still backs the fixture's own homeTeamSystem/
 * awayTeamSystem (confirmed real) for the case homeFormation/
 * awayFormation are null, which happens before kickoff. The "coach"
 * array (same flat entry shape, type:"coach") was already being fetched
 * here but discarded until now — its first entry's name is surfaced as
 * the head coach, confirmed real via a raw response pasted 2026-09-09
 * (also confirmed as its own first-class /coaches resource). */
export function buildGoalApiLineups(
  raw: GoalApiLineups | null | undefined,
  homeFormationFallback?: string | null,
  awayFormationFallback?: string | null,
): BuiltLineups {
  return {
    confirmed: raw?.hasLineups ?? false,
    home: buildLineupTeam(raw?.home, raw?.homeFormation ?? homeFormationFallback),
    away: buildLineupTeam(raw?.away, raw?.awayFormation ?? awayFormationFallback),
  };
}

export type BuiltTopScorer = { rank: number; playerName: string; teamName: string; goals: number; assists: number; penaltyGoals: number };

/** Maps GOAL API's /leagues/:id/top-scorers response (confirmed real,
 * 2026-09-09) into a compact ranked list for the frontend's "Artilheiros"
 * tab. goals/assists/penaltyGoals arrive as numeric strings on the raw
 * response, same convention as fixture scores elsewhere in this file. */
export function buildGoalApiTopScorers(raw: GoalApiTopScorer[] | null | undefined): BuiltTopScorer[] {
  if (!raw) return [];
  return raw.map((s) => ({
    rank: Number(s.playerPlace) || 0,
    playerName: s.playerName,
    teamName: s.teamName,
    goals: Number(s.goals) || 0,
    assists: Number(s.assists) || 0,
    penaltyGoals: Number(s.penaltyGoals) || 0,
  }));
}

/** Promotion/relegation zone classification from /standings/:leagueId/zones
 * (confirmed real 2026-09-09) — "european" is a shortened form of the raw
 * "europeanQualification" bucket name, everything else matches verbatim.
 * A league with no real zone structure (e.g. MLS, a closed franchise
 * league) puts every team in "safe", which renders as no highlight. */
export type StandingZone = "promotion" | "european" | "safe" | "relegationPlayoff" | "relegation";

export type BuiltStandingRow = {
  pos: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
  zone?: StandingZone;
};
export type BuiltStandingsGroup = { name: string; rows: BuiltStandingRow[] };
export type BuiltStandings = { league: string; teams: BuiltStandingRow[]; groups: BuiltStandingsGroup[] | null };

function buildStandingRow(row: GoalApiStanding, zoneByTeamId?: Map<string, StandingZone>): BuiltStandingRow {
  return {
    pos: Number(row.overallLeaguePosition) || 0,
    name: row.team?.name ?? row.teamName,
    played: Number(row.overallLeaguePlayed) || 0,
    won: Number(row.overallLeagueW) || 0,
    drawn: Number(row.overallLeagueD) || 0,
    lost: Number(row.overallLeagueL) || 0,
    gf: Number(row.overallLeagueGF) || 0,
    ga: Number(row.overallLeagueGA) || 0,
    pts: Number(row.overallLeaguePTS) || 0,
    zone: zoneByTeamId?.get(row.teamId),
  };
}

/** Maps /standings/:leagueId/zones (confirmed real 2026-09-09) into a
 * teamId → zone lookup for buildGoalApiStandings to attach per-row.
 * Skipped entirely (empty map) on fetch failure — a missing zone is just
 * "no highlight", never worth failing the standings table over. */
export function buildGoalApiStandingZoneMap(raw: GoalApiStandingZones | null | undefined): Map<string, StandingZone> {
  const map = new Map<string, StandingZone>();
  if (!raw?.zones) return map;
  const assign = (rows: GoalApiStanding[] | undefined, zone: StandingZone) => {
    for (const row of rows ?? []) map.set(row.teamId, zone);
  };
  assign(raw.zones.promotion, "promotion");
  assign(raw.zones.europeanQualification, "european");
  assign(raw.zones.safe, "safe");
  assign(raw.zones.relegationPlayoff, "relegationPlayoff");
  assign(raw.zones.relegation, "relegation");
  return map;
}

/** Maps GOAL API's /standings/:leagueId response (confirmed real,
 * 2026-09-09) into the frontend's Classificação tab shape — that tab has
 * never shown a real table for any sport including football: its only
 * backend source (buildLeagueStandings in routes/matches.ts) is a fully
 * synthetic ELO-seeded generator that fabricates positions/points for a
 * hardcoded team list, indistinguishable in the UI from a real table.
 *
 * A league with conferences/divisions (e.g. MLS) repeats each position
 * once per group in the flat array — "leagueRound" carries the group name
 * in that case, so rows are split into groups by that field; a league
 * with a single table (no distinct leagueRound values) is returned as one
 * flat sorted list instead. zoneByTeamId (from buildGoalApiStandingZoneMap)
 * is optional so this still works standalone if the zones fetch fails. */
export function buildGoalApiStandings(
  raw: GoalApiStanding[] | null | undefined,
  leagueName: string,
  zoneByTeamId?: Map<string, StandingZone>,
): BuiltStandings {
  if (!raw || raw.length === 0) return { league: leagueName, teams: [], groups: null };
  const league = raw[0]?.league?.name ?? leagueName;
  const roundNames = new Set(raw.map((row) => row.leagueRound).filter((r): r is string => !!r));
  if (roundNames.size > 1) {
    const groups: BuiltStandingsGroup[] = Array.from(roundNames).map((name) => ({
      name,
      rows: raw
        .filter((row) => row.leagueRound === name)
        .map((row) => buildStandingRow(row, zoneByTeamId))
        .sort((a, b) => a.pos - b.pos),
    }));
    return { league, teams: groups.flatMap((g) => g.rows), groups };
  }
  const teams = raw.map((row) => buildStandingRow(row, zoneByTeamId)).sort((a, b) => a.pos - b.pos);
  return { league, teams, groups: null };
}

export type BuiltTeamUpcomingEntry = { date: string; opponent: string; competition: string; isHome: boolean };

/** Maps GOAL API's /teams/:id/upcoming (same canonical fixture DTO as every
 * other GOAL API fixture endpoint) into the frontend's "Próximos Jogos"
 * shape — previously sourced from SportMonks team schedules, removed along
 * with that provider and hardcoded to []. Compact "DD/MM" date to fit the
 * existing fixed-width display slot. */
export function buildGoalApiTeamUpcoming(fixtures: GoalApiFixture[] | null | undefined, teamId: string): BuiltTeamUpcomingEntry[] {
  if (!fixtures) return [];
  return fixtures.map((fx) => {
    const isHome = fx.homeTeam?.id === teamId;
    const opponent = isHome ? fx.awayTeam?.name : fx.homeTeam?.name;
    const iso = fx.kickoffUtc;
    let date = "";
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" }).formatToParts(d);
        const p: Record<string, string> = {};
        for (const part of parts) p[part.type] = part.value;
        date = `${p["day"] ?? "?"}/${p["month"] ?? "?"}`;
      }
    }
    return { date, opponent: opponent ?? "?", competition: fx.leagueName ?? "", isHome };
  });
}

export type BuiltFormEntry = { result: "W" | "D" | "L"; score: string; opponent: string; home: boolean };

/** Maps GOAL API's /teams/:id/results (confirmed real, most-recent-first)
 * into the "Forma" tab's FormEntry shape — that tab has never shown real
 * data ("homeForm/awayForm are never populated... this is always false",
 * per /stats's own comment) since the StatPal enrichment that used to feed
 * it was removed; this is the real replacement.
 *
 * "data" is a single aggregate object, not a flat fixture array — an
 * earlier pass of this mapper assumed the latter before a fuller raw
 * response surfaced the real shape (2026-09-09). recentFixtures already
 * carries a per-team "result" (W/D/L) and a literal "home-away" score
 * string; the frontend's FormEntry.score is expected in the queried
 * team's own perspective ("ownGoals-opponentGoals", see
 * MatchStatsPanel's goals-scored/clean-sheets aggregates), so the two
 * numbers are swapped for away fixtures. Caps at 5 to match the tab's
 * existing expectations. */
export function buildGoalApiForm(results: GoalApiTeamResults | null | undefined): BuiltFormEntry[] {
  const fixtures = results?.recentFixtures;
  if (!fixtures) return [];
  const entries: BuiltFormEntry[] = [];
  for (const fx of fixtures) {
    if (entries.length >= 5) break;
    const parts = fx.score?.split(/[-–]/).map((n) => Number(n.trim()));
    if (!parts || parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;
    const [homeScore, awayScore] = parts as [number, number];
    const ownScore = fx.isHome ? homeScore : awayScore;
    const oppScore = fx.isHome ? awayScore : homeScore;
    entries.push({
      result: fx.result,
      score: `${ownScore}-${oppScore}`,
      opponent: fx.opponent ?? "?",
      home: fx.isHome,
    });
  }
  return entries;
}

/** ISO-8601 kickoffUtc → { date: "DD.MM.YYYY", time: "HH:MM" } in
 * Europe/Lisbon — same shape/timezone every other provider in this app
 * already uses (see routes/matches.ts's proplineEventDateTime). Falls back
 * to the compatibility matchDate/matchTime strings only if kickoffUtc is
 * somehow missing — those carry no timezone offset and, per the provider's
 * own migration note, meant Europe/Berlin before 2026-08-20, so they are
 * deliberately treated as a last resort, not the primary source. */
export function goalApiKickoffDateTime(fixture: GoalApiFixture): { date: string; time: string } {
  const iso = fixture.kickoffUtc;
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Lisbon",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const p: Record<string, string> = {};
      for (const part of parts) p[part.type] = part.value;
      const hh = p["hour"] === "24" ? "00" : (p["hour"] ?? "00");
      return {
        date: `${p["day"] ?? "01"}.${p["month"] ?? "01"}.${p["year"] ?? "2025"}`,
        time: `${hh}:${p["minute"] ?? "00"}`,
      };
    }
  }
  if (fixture.matchDate && fixture.matchTime) {
    const [y, m, d] = fixture.matchDate.split("-");
    if (y && m && d) return { date: `${d}.${m}.${y}`, time: fixture.matchTime };
  }
  return { date: "", time: "" };
}

export type BuiltPlayerRecentMatch = {
  fixtureId: string;
  date: string;
  opponent: string;
  competition: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number | null;
  rating: number | null;
};

export type BuiltPlayerProfile = {
  id: string;
  name: string;
  imageUrl: string | null;
  nationality: string | null;
  nationalityFlagUrl: string | null;
  position: string | null;
  height: number | null;
  weight: number | null;
  dateOfBirth: string | null;
  team: string | null;
  teamLogoUrl: string | null;
  competition: string | null;
  seasonStats: {
    appearances: number | null;
    goals: number | null;
    assists: number | null;
    yellowCards: number | null;
    redCards: number | null;
    minutesPlayed: number | null;
  };
  recentMatches: BuiltPlayerRecentMatch[];
};

/** Maps GOAL API's /players/:id + /players/:id/statistics (confirmed real
 * 2026-09-09) into the Player Profile modal's shape — previously sourced
 * from SportMonks, removed and left as a hardcoded 404 stub ever since
 * ("player profile unavailable" for every id). Identity/team fields come
 * from the plain player object (real nulls); "performance" from the
 * statistics call backs seasonStats. height/weight/competition/
 * nationalityFlagUrl aren't present in either raw response, so stay null
 * rather than guessed. recentMatches has never been observed non-empty in
 * a real statistics response — mapped as empty until a populated example
 * confirms its item shape; the modal already hides that section when
 * empty. */
export function buildGoalApiPlayerProfile(
  player: GoalApiPlayer,
  stats: GoalApiPlayerStatistics | null | undefined,
): BuiltPlayerProfile {
  const perf = stats?.performance;
  return {
    id: player.id,
    name: player.name,
    imageUrl: player.image ?? null,
    nationality: player.country ?? null,
    nationalityFlagUrl: null,
    position: player.type ?? null,
    height: null,
    weight: null,
    dateOfBirth: player.birthdate ?? null,
    team: player.team?.name ?? null,
    teamLogoUrl: player.team?.badge ?? null,
    competition: null,
    seasonStats: {
      appearances: perf?.matchPlayed ?? null,
      goals: perf?.goals ?? null,
      assists: perf?.assists ?? null,
      yellowCards: perf?.yellowCards ?? null,
      redCards: perf?.redCards ?? null,
      minutesPlayed: perf?.minutes ?? null,
    },
    recentMatches: [],
  };
}

export type BuiltFootballResult = {
  id: string;
  home: string;
  homeBadge: string | null;
  away: string;
  awayBadge: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
  league: string;
  country: string | null;
  round: string | null;
  date: string;
  time: string;
};

/** Maps one /results, /results/today or /results/yesterday entry into the
 * shape the football "Resultados" panel renders — first real finished-match
 * feed for football (previously only derivable indirectly, per-match, by
 * watching a tracked live match disappear from liveMatchState). */
export function buildGoalApiResultMatch(fixture: GoalApiFixture): BuiltFootballResult {
  const { date, time } = goalApiKickoffDateTime(fixture);
  return {
    id: fixture.id,
    home: fixture.homeTeam.name,
    homeBadge: fixture.homeTeam.badge ?? null,
    away: fixture.awayTeam.name,
    awayBadge: fixture.awayTeam.badge ?? null,
    homeScore: Number(fixture.homeTeamScore ?? 0),
    awayScore: Number(fixture.awayTeamScore ?? 0),
    status: fixture.matchStatus,
    league: fixture.leagueName ?? "",
    country: null,
    round: fixture.matchRound ?? null,
    date,
    time,
  };
}

export function buildGoalApiResults(fixtures: GoalApiFixture[] | null | undefined): BuiltFootballResult[] {
  if (!fixtures) return [];
  return fixtures.map(buildGoalApiResultMatch);
}

export type BuiltResultsStats = {
  totalMatches: number;
  totalGoals: number;
  averageGoals: number;
  homeWinPercentage: number;
  drawPercentage: number;
  awayWinPercentage: number;
  bttsPercentage: number;
  over25Percentage: number;
  over35Percentage: number;
  mostCommonScore: { score: string; percentage: number } | null;
};

/** Maps /results/stats's aggregate object into the panel's trends card.
 * Percent fields are already computed server-side (0-100 numbers); this
 * only picks the headline fields and defaults missing ones to 0 rather
 * than fabricating a plausible-looking value. */
export function buildGoalApiResultsStats(raw: GoalApiResultsStats | null | undefined): BuiltResultsStats | null {
  if (!raw) return null;
  return {
    totalMatches: raw.totalMatches ?? 0,
    totalGoals: raw.totalGoals ?? 0,
    averageGoals: raw.averageGoals ?? 0,
    homeWinPercentage: raw.homeWinPercentage ?? 0,
    drawPercentage: raw.drawPercentage ?? 0,
    awayWinPercentage: raw.awayWinPercentage ?? 0,
    bttsPercentage: raw.bttsPercentage ?? 0,
    over25Percentage: raw.over25Percentage ?? 0,
    over35Percentage: raw.over35Percentage ?? 0,
    mostCommonScore: raw.mostCommonScore
      ? { score: raw.mostCommonScore.score, percentage: raw.mostCommonScore.percentage }
      : null,
  };
}
