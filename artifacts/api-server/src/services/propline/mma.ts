// PropLine MMA/boxing — same shared fetch/cache/extract as football.ts
// (see common.ts). This app's "mma" sport bucket already combines UFC and
// boxing under one tab (same pattern PulseScore's buildMmaUpcomingFromPulseScore
// uses), so both PropLine sport_keys feed the same builder.
//
// Live: same "not in PropLine's confirmed near-real-time list" caveat as
// tennis/volleyball/football — added anyway as a candidate since that
// caveat already proved unreliable for football (see tennis.ts's header).
// Unlike every other PropLine sport here, MMA/boxing had NO live path at
// all before this (this app's own GoalServe mma live builder existed but
// was never wired into the live tri-fallback either) — see matches.ts.
import { CONFIG } from "../../lib/config.js";
import { getPropLineOdds, getPropLineScores, extractPropLineH2HOdds } from "./common.js";
import type { PropLineEvent, PropLineScoreEvent } from "./common.js";

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

export type PropLineMmaLeagueScores = { sportKey: string; events: PropLineScoreEvent[] };

export async function getPropLineMmaLiveAllLeagues(): Promise<PropLineMmaLeagueScores[]> {
  if (!CONFIG.ENABLE_PROPLINE) return [];
  if (!CONFIG.PROPLINE_API_KEY) return [];
  const perLeague = await Promise.all(
    PROPLINE_MMA_SPORT_KEYS.map(async (sportKey) => ({
      sportKey,
      events: await getPropLineScores(sportKey),
    })),
  );
  return perLeague.map(({ sportKey, events }) => ({
    sportKey,
    events: events.filter((e) => e.status === "in_progress"),
  }));
}
