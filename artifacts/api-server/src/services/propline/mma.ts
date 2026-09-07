// PropLine MMA/boxing — same shared fetch/cache/extract as football.ts
// (see common.ts). This app's "mma" sport bucket already combines UFC and
// boxing under one tab (same pattern PulseScore's buildMmaUpcomingFromPulseScore
// uses), so both PropLine sport_keys feed the same builder. No live
// builder yet — neither is in PropLine's confirmed near-real-time sport
// list, same caveat as football/tennis/volleyball.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent } from "./common.js";

export const PROPLINE_MMA_SPORT_KEYS = ["mma_ufc", "boxing"];

export function extractPropLineMmaOdds(bookmakers: PropLineEvent["bookmakers"], home: string, away: string) {
  return extractPropLineH2HOdds(bookmakers, home, away, false);
}

export type PropLineMmaLeagueOdds = { sportKey: string; events: PropLineEvent[] };

export async function getPropLineMmaOddsAllLeagues(): Promise<PropLineMmaLeagueOdds[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  return Promise.all(
    PROPLINE_MMA_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineOdds(sportKey),
    })),
  );
}
