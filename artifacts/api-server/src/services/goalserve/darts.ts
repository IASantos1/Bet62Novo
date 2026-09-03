import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "darts",
  matchIdPrefix: "gs-darts-",
  scoresFeedPrefix: "darts",
  oddsCategory: "darts",
  upcomingFeeds: ["home"],
});

export {
  getUpcomingRaw as getGoalServeDartsUpcomingRaw,
  getLiveRaw as getGoalServeDartsLiveRaw,
  attachOdds as attachGoalServeDartsOdds,
};
