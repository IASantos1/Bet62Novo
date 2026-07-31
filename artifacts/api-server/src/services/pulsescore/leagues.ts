// Prematch league listing — a preliminary step towards a real fixtures
// cutover to PulseScore (its schema has no country field, so before that
// migration can be safe we need to know how much of what bet365 actually
// covers we can already resolve a country for via
// countryForLeagueName()/DOMESTIC_PRIORITY in matches.ts). This module only
// fetches the raw league list; the coverage report itself lives in
// routes/admin.ts (pulsescore-league-coverage) since it needs
// countryForLeagueName from matches.ts.
import { pulseScoreGet } from "./client.js";

export type PulseScoreLeague = {
  league: string;
  sport: string;
  live: boolean;
  eventCount: number;
};

/** Football's prematch leagues live at the bookmaker's root path (no sport
 * prefix — the docs call this out explicitly: "Futebol usa o caminho raiz").
 * Paginates up to `maxPages` (default 10, i.e. up to 500 leagues at the
 * documented default limit of 50/page) to avoid an unbounded fetch loop. */
export async function pulseScoreFetchFootballLeagues(
  maxPages = 10,
): Promise<PulseScoreLeague[]> {
  const out: PulseScoreLeague[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await pulseScoreGet<PulseScoreLeague[]>(
      `/leagues?page=${page}&limit=50`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 50) break; // last page
  }
  return out;
}
