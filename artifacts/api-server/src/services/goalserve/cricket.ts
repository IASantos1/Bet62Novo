import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "cricket",
  matchIdPrefix: "gs-cricket-",
  scoresFeedPrefix: "cricket",
  oddsCategory: "cricket",
  upcomingFeeds: ["schedule", "livescore"],
});

export {
  getUpcomingRaw as getGoalServeCricketUpcomingRaw,
  getLiveRaw as getGoalServeCricketLiveRaw,
  attachOdds as attachGoalServeCricketOdds,
};
