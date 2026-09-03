import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "futsal",
  matchIdPrefix: "gs-futsal-",
  scoresFeedPrefix: "soccernew",
  oddsCategory: "futsal",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeFutsalUpcomingRaw,
  getLiveRaw as getGoalServeFutsalLiveRaw,
  attachOdds as attachGoalServeFutsalOdds,
};
