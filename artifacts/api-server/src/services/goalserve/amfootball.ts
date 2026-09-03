import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "amfootball",
  matchIdPrefix: "gs-amfootball-",
  scoresFeedPrefix: "football",
  oddsCategory: "football",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeAmfootballUpcomingRaw,
  getLiveRaw as getGoalServeAmfootballLiveRaw,
  attachOdds as attachGoalServeAmfootballOdds,
};
