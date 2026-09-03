import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "rugby",
  matchIdPrefix: "gs-rugby-",
  scoresFeedPrefix: "rugby",
  oddsCategory: "rugby",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeRugbyUpcomingRaw,
  getLiveRaw as getGoalServeRugbyLiveRaw,
  attachOdds as attachGoalServeRugbyOdds,
};
