import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "tennis",
  matchIdPrefix: "gs-tennis-",
  scoresFeedPrefix: "tennis_scores",
  oddsCategory: "tennis",
  upcomingFeeds: ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
});

export {
  getUpcomingRaw as getGoalServeTennisUpcomingRaw,
  getLiveRaw as getGoalServeTennisLiveRaw,
  attachOdds as attachGoalServeTennisOdds,
};
