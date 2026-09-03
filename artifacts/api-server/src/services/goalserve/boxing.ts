import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "boxing",
  matchIdPrefix: "gs-boxing-",
  scoresFeedPrefix: "boxing",
  oddsCategory: "boxing",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeBoxingUpcomingRaw,
  getLiveRaw as getGoalServeBoxingLiveRaw,
  attachOdds as attachGoalServeBoxingOdds,
};
