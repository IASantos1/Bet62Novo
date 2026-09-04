import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "futsal",
  matchIdPrefix: "gs-futsal-",
  // Was "soccernew" (the regular SOCCER feed prefix) — confirmed against the
  // GoalServe docs (futsal/home is its own documented endpoint, distinct
  // from soccernew/home) that this was pulling real 11-a-side soccer
  // matches and serving them mislabeled as futsal fixtures.
  scoresFeedPrefix: "futsal",
  oddsCategory: "futsal",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeFutsalUpcomingRaw,
  getLiveRaw as getGoalServeFutsalLiveRaw,
  attachOdds as attachGoalServeFutsalOdds,
};
