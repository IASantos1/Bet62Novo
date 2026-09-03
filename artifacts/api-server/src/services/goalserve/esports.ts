import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "esports",
  matchIdPrefix: "gs-esports-",
  scoresFeedPrefix: "esports",
  oddsCategory: "esports",
  upcomingFeeds: ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
});

export {
  getUpcomingRaw as getGoalServeEsportsUpcomingRaw,
  getLiveRaw as getGoalServeEsportsLiveRaw,
  attachOdds as attachGoalServeEsportsOdds,
};
