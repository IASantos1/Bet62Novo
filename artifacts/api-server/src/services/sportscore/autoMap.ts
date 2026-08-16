// Automatic team-name-based population of sportscore_match_map — the piece
// the table's own schema comment (lib/db/src/schema/sportscoreMatchMap.ts)
// always described as the design ("populated automatically by matching
// team names against /api/widget/matches/... falling back to manual entry
// when the automatic match can't be found") but that was never actually
// implemented; only the manual-entry admin UI existed until now.
import { db, sportscoreMatchMapTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { resolveSportscoreMatchByTeams } from "./client.js";

// A resolved-but-not-yet-found result is cheap to re-derive, but a genuine
// miss (SportScore doesn't have this fixture right now) isn't worth
// re-querying on every single request for the same match — short cache,
// just enough to survive a burst of repeated calls for one popular match.
const MISS_TTL_MS = 5 * 60_000;
const recentMisses = new Map<string, number>();

/** Returns an existing sportscore_match_map row for (sport, statpalMatchId)
 * if one exists (manual or previously auto-resolved), otherwise tries to
 * resolve one now via SportScore's real fixtures list and persists it with
 * source "auto" so future calls for the same match skip straight to the DB.
 * Returns null if nothing could be resolved — callers should treat that
 * exactly like "no tracker available for this match", not as an error. */
export async function autoResolveSportscoreMapping(
  sport: string,
  statpalMatchId: string,
  home: string,
  away: string,
) {
  const existing = await db
    .select()
    .from(sportscoreMatchMapTable)
    .where(
      and(
        eq(sportscoreMatchMapTable.sport, sport),
        eq(sportscoreMatchMapTable.statpalMatchId, statpalMatchId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const missKey = `${sport}:${statpalMatchId}`;
  const missedAt = recentMisses.get(missKey);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;

  const match = await resolveSportscoreMatchByTeams(sport, home, away);
  if (!match) {
    recentMisses.set(missKey, Date.now());
    return null;
  }

  const [row] = await db
    .insert(sportscoreMatchMapTable)
    .values({
      sport,
      statpalMatchId,
      sportscoreId: match.sportscoreId,
      trackerId: match.trackerId,
      homeTeam: match.home,
      awayTeam: match.away,
      source: "auto",
    })
    .returning();
  logger.info(
    { sport, statpalMatchId, sportscoreId: match.sportscoreId, home, away },
    "[sportscore] auto-resolved match mapping",
  );
  return row ?? null;
}
