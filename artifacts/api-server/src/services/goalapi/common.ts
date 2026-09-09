// Shared, sport-agnostic (well — football is the only sport this provider
// covers) extraction helpers for GOAL API responses.
import type { GoalApiFixture, GoalApiOdds, GoalApiFixtureStatistics, GoalApiMatchEvent } from "./index.js";

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

/** Maps GOAL API's raw match events into the shape routes/matches.ts's
 * LiveMatchState.events field already expects (same field every other
 * provider in this file populates). */
export function buildGoalApiEvents(
  events: GoalApiMatchEvent[] | null | undefined,
): Array<{ type: string; team: string; minute: number; player: string; detail?: string }> {
  if (!events) return [];
  return events.map((e) => ({
    type: e.type,
    team: e.team,
    minute: e.minute,
    player: e.player,
    detail: e.detail,
  }));
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
