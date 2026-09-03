import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "mma",
  matchIdPrefix: "gs-mma-",
  scoresFeedPrefix: "mma",
  oddsCategory: "mma",
  upcomingFeeds: ["home", "mma"],
});

export {
  getUpcomingRaw as getGoalServeMmaUpcomingRaw,
  getLiveRaw as getGoalServeMmaLiveRaw,
  attachOdds as attachGoalServeMmaOdds,
};
