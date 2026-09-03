import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "handball",
  matchIdPrefix: "gs-handball-",
  scoresFeedPrefix: "handball",
  oddsCategory: "handball",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeHandballUpcomingRaw,
  getLiveRaw as getGoalServeHandballLiveRaw,
  attachOdds as attachGoalServeHandballOdds,
};
