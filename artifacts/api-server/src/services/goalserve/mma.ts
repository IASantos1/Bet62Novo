import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "mma",
  matchIdPrefix: "gs-mma-",
  // Neither "mma/home" nor "mma/mma" exist per the GoalServe docs — the
  // real endpoints are mma/schedule (upcoming) and mma/live (in-progress
  // fights, a separate feed rather than inline status on the schedule).
  scoresFeedPrefix: "mma",
  oddsCategory: "mma",
  upcomingFeeds: ["schedule"],
  liveFeedPath: "live",
});

export {
  getUpcomingRaw as getGoalServeMmaUpcomingRaw,
  getLiveRaw as getGoalServeMmaLiveRaw,
  attachOdds as attachGoalServeMmaOdds,
};
