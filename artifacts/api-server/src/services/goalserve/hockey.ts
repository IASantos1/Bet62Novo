import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "hockey",
  matchIdPrefix: "gs-hockey-",
  scoresFeedPrefix: "hockey",
  oddsCategory: "hockey",
  upcomingFeeds: ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
});

export {
  getUpcomingRaw as getGoalServeHockeyUpcomingRaw,
  getLiveRaw as getGoalServeHockeyLiveRaw,
  attachOdds as attachGoalServeHockeyOdds,
};
