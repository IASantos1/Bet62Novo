// Pure event-classification helpers consumed by buildFootballLiveFromGoalApi
// in routes/matches.ts. Goal counts are already covered by comparing
// homeScore/awayScore tick-to-tick (score IS the goal count for football),
// but red cards need their own signal since they don't move the score —
// same reason the old (deleted) SportMonks integration tracked them via a
// dedicated countSportMonksRedCards helper (services/sportmonks/football.ts)
// rather than inferring them from anything score-shaped.
import type { GoalApiMatchEvent } from "./index.js";

/** Only "GOAL" events have been confirmed real for this endpoint so far
 * (raw response pasted 2026-09-09) — no card event has actually been
 * observed, so the type/side match below is a best-effort guess pending a
 * real sample, not a confirmed field mapping like the GOAL handling in
 * buildGoalApiEvents. Side is read from "info" since a card event has no
 * scorer field to infer it from. */
export function countGoalApiRedCards(
  events: GoalApiMatchEvent[] | null | undefined,
  team: "home" | "away",
): number {
  if (!events) return 0;
  return events.filter((e) => {
    const type = e.type.toLowerCase();
    return e.info === team && type.includes("card") && type.includes("red");
  }).length;
}
