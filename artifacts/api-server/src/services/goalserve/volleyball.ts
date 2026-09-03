import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "volleyball",
  matchIdPrefix: "gs-volleyball-",
  scoresFeedPrefix: "volleyball",
  oddsCategory: "volleyball",
  upcomingFeeds: ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
});

export {
  getUpcomingRaw as getGoalServeVolleyballUpcomingRaw,
  getLiveRaw as getGoalServeVolleyballLiveRaw,
  attachOdds as attachGoalServeVolleyballOdds,
};
