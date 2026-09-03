import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "basketball",
  matchIdPrefix: "gs-basketball-",
  scoresFeedPrefix: "bsktbl",
  oddsCategory: "basket",
  upcomingFeeds: ["home", "d1", "d2", "d3", "d4", "d5", "d6", "d7"],
});

export {
  getUpcomingRaw as getGoalServeBasketballUpcomingRaw,
  getLiveRaw as getGoalServeBasketballLiveRaw,
  attachOdds as attachGoalServeBasketballOdds,
};
