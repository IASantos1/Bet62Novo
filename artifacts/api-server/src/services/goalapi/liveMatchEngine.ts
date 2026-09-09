// Pure event-classification helpers consumed by buildFootballLiveFromGoalApi
// in routes/matches.ts. Goal counts are already covered by comparing
// homeScore/awayScore tick-to-tick (score IS the goal count for football),
// but red cards need their own signal since they don't move the score —
// same reason the old (deleted) SportMonks integration tracked them via a
// dedicated countSportMonksRedCards helper (services/sportmonks/football.ts)
// rather than inferring them from anything score-shaped.
import type { GoalApiMatchEvent } from "./index.js";

export function countGoalApiRedCards(
  events: GoalApiMatchEvent[] | null | undefined,
  team: "home" | "away",
): number {
  if (!events) return 0;
  return events.filter(
    (e) => e.team === team && e.type === "card" && (e.detail ?? "").toLowerCase().includes("red"),
  ).length;
}
