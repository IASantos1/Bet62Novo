// Pure event-classification helpers consumed by buildFootballLiveFromGoalApi
// in routes/matches.ts. Goal counts are already covered by comparing
// homeScore/awayScore tick-to-tick (score IS the goal count for football),
// but red cards need their own signal since they don't move the score —
// same reason the old (deleted) SportMonks integration tracked them via a
// dedicated countSportMonksRedCards helper (services/sportmonks/football.ts)
// rather than inferring them from anything score-shaped.
import type { GoalApiCard } from "./index.js";

/** Real bug fixed 2026-09-20 (user-reported: red-card suspension never
 * actually triggering despite looking wired up): cards were never
 * confirmed real on the /events endpoint (only "GOAL" has ever been
 * observed there) — this function used to read `e.info === team` and
 * `e.type.includes("card")` against events, which could never match
 * anything, making red-card suspension a silent no-op. Cards live on
 * their own dedicated /fixtures/:id/cards endpoint (confirmed real
 * 2026-09-20, raw response captured with 3 real yellow cards), whose
 * `card` field takes values like "yellow card", and whose `homeFault`/
 * `awayFault` (the fouling player's name, non-null only for the team that
 * committed the foul) — not an `info` field — is the real side signal. */
export function countGoalApiRedCards(
  cards: GoalApiCard[] | null | undefined,
  team: "home" | "away",
): number {
  if (!cards) return 0;
  return cards.filter((c) => {
    const isRed = c.card.toLowerCase().includes("red");
    const isTeam = team === "home" ? c.homeFault != null : c.awayFault != null;
    return isRed && isTeam;
  }).length;
}
