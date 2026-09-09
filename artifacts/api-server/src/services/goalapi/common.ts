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
  GoalApiLineupPlayerEntry,
  GoalApiTopScorer,
  GoalApiTeamResults,
} from "./index.js";

/** Shapes GOAL API's per-fixture statistics into the frontend's existing
 * generic stats-row renderer (home.tsx's V2StatsGroup type) — previously
 * fed by the deleted SportsAPI Pro V2 integration and hardcoded to an
 * empty array ever since. Only includes a row when at least one side has
 * a real value for it, so a field the provider hasn't populated for this
 * fixture yet just doesn't show up rather than rendering a fake "0". */
export function buildGoalApiMatchStats(
  stats: GoalApiFixtureStatistics | null | undefined,
): Array<{ title: string; rows: Array<{ name: string; home: string; away: string }> }> {
  if (!stats) return [];
  const rows: Array<{ name: string; home: string; away: string }> = [];
  const add = (name: string, home: unknown, away: unknown) => {
    if (home == null && away == null) return;
    rows.push({ name, home: home != null ? String(home) : "-", away: away != null ? String(away) : "-" });
  };
  add("Posse de bola", stats.home.possession, stats.away.possession);
  add("Remates", stats.home.shotsOnGoal != null && stats.home.shotsOffGoal != null
    ? stats.home.shotsOnGoal + stats.home.shotsOffGoal
    : undefined, stats.away.shotsOnGoal != null && stats.away.shotsOffGoal != null
    ? stats.away.shotsOnGoal + stats.away.shotsOffGoal
    : undefined);
  add("Remates à baliza", stats.home.shotsOnGoal, stats.away.shotsOnGoal);
  add("Remates fora", stats.home.shotsOffGoal, stats.away.shotsOffGoal);
  add("Cantos", stats.home.corners, stats.away.corners);
  add("Faltas", stats.home.fouls, stats.away.fouls);
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
): Array<{ type: string; team: string; minute: number; player: string; detail?: string }> {
  const fromEvents = (events ?? []).map((e) => {
    const team: "home" | "away" = e.homeScorer ? "home" : e.awayScorer ? "away" : e.info === "away" ? "away" : "home";
    const player = (team === "home" ? e.homeScorer : e.awayScorer) ?? "?";
    const assist = team === "home" ? e.homeAssist : e.awayAssist;
    const detailParts = [assist ? `Assistência: ${assist}` : null, e.info === "Penalty" ? "Grande Penalidade" : null].filter(
      (v): v is string => Boolean(v),
    );
    return {
      type: e.type === "GOAL" ? "goal" : e.type.toLowerCase(),
      team,
      minute: parseGoalApiEventMinute(e.time),
      player,
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
 * início da partida"). */
export function extractGoalApi1x2Odds(
  oddsList: GoalApiOdds[] | null | undefined,
): { home: number; draw: number; away: number } | null {
  if (!oddsList || oddsList.length === 0) return null;
  for (const entry of oddsList) {
    const o = entry["1x2"];
    if (o && o.home != null && o.draw != null && o.away != null) {
      return { home: o.home, draw: o.draw, away: o.away };
    }
  }
  return null;
}

export function extractGoalApiOverUnder25(
  oddsList: GoalApiOdds[] | null | undefined,
): { over: number; under: number } | null {
  if (!oddsList || oddsList.length === 0) return null;
  for (const entry of oddsList) {
    const line = entry.overUnder?.["2.5"] ?? entry.overUnder?.["o+2.5"];
    if (line && line.over != null && line.under != null) {
      return { over: line.over, under: line.under };
    }
  }
  return null;
}

export function extractGoalApiBothTeamsToScore(
  oddsList: GoalApiOdds[] | null | undefined,
): { yes: number; no: number } | null {
  if (!oddsList || oddsList.length === 0) return null;
  for (const entry of oddsList) {
    const b = entry.bothTeamsToScore;
    if (b && b.yes != null && b.no != null) return { yes: b.yes, no: b.no };
  }
  return null;
}

export type BuiltLineupPlayer = { name: string; shortName?: string; position: string; number: string; rating?: number };
export type BuiltLineupTeam = { formation?: string; starters: BuiltLineupPlayer[]; bench: BuiltLineupPlayer[] };
export type BuiltLineups = { confirmed: boolean; home: BuiltLineupTeam; away: BuiltLineupTeam };

function buildLineupPlayer(entry: GoalApiLineupPlayerEntry): BuiltLineupPlayer {
  // Some providers wrap each entry as { player: {...} } — unwrap once if so.
  const e = entry.player ?? entry;
  const name = e.name ?? e.playerName ?? "?";
  const number = e.number ?? e.shirtNumber;
  const rating = e.rating != null ? Number(e.rating) : undefined;
  return {
    name,
    shortName: e.shortName,
    position: e.position ?? e.pos ?? "",
    number: number != null ? String(number) : "",
    rating: rating != null && Number.isFinite(rating) ? rating : undefined,
  };
}

function buildLineupTeam(team: GoalApiLineupTeam | undefined, formationFallback?: string | null): BuiltLineupTeam {
  const starters = (team?.starters ?? team?.startXI ?? []).map(buildLineupPlayer);
  const bench = (team?.substitutes ?? team?.bench ?? []).map(buildLineupPlayer);
  return { formation: team?.formation ?? formationFallback ?? undefined, starters, bench };
}

/** Maps GOAL API's /fixtures/:id/lineups response into the frontend's
 * existing LineupsV2 shape (home.tsx) — previously fed by the deleted
 * SportsAPI Pro V2 integration and hardcoded to null ever since. Unlike
 * every other GoalApi* raw shape used in this file, this endpoint's exact
 * field names haven't been confirmed against a real response yet, so this
 * reads several plausible key names defensively rather than assuming one —
 * callers log the raw payload so the mapping can be corrected once a real
 * lineup is seen. formationFallback lets the fixture's own
 * homeTeamSystem/awayTeamSystem (confirmed real) show even before lineups
 * are officially published. */
export function buildGoalApiLineups(
  raw: GoalApiLineups | null | undefined,
  homeFormationFallback?: string | null,
  awayFormationFallback?: string | null,
): BuiltLineups {
  return {
    confirmed: raw?.confirmed ?? false,
    home: buildLineupTeam(raw?.home, homeFormationFallback),
    away: buildLineupTeam(raw?.away, awayFormationFallback),
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
