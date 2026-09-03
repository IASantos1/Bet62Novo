import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "baseball",
  matchIdPrefix: "gs-baseball-",
  scoresFeedPrefix: "baseball",
  oddsCategory: "baseball",
  upcomingFeeds: ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
});

export {
  getUpcomingRaw as getGoalServeBaseballUpcomingRaw,
  getLiveRaw as getGoalServeBaseballLiveRaw,
  attachOdds as attachGoalServeBaseballOdds,
};
