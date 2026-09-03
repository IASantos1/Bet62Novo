import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "rugby",
  matchIdPrefix: "gs-rugbyleague-",
  scoresFeedPrefix: "rugbyleague",
  oddsCategory: "rugbyleague",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeRugbyLeagueUpcomingRaw,
  getLiveRaw as getGoalServeRugbyLeagueLiveRaw,
  attachOdds as attachGoalServeRugbyLeagueOdds,
};
