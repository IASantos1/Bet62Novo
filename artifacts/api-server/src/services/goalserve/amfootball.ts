import { makeGoalServeSportAdapter } from "./factory.js";

const { getUpcomingRaw, getLiveRaw, attachOdds } = makeGoalServeSportAdapter({
  sport: "amfootball",
  matchIdPrefix: "gs-amfootball-",
  // GoalServe has no generic "football/home" feed for American football —
  // confirmed against docs each league is its own pair of endpoints under
  // the shared football/ folder (NFL, NCAA FBS/D3/FCS), plus XFL living in
  // its own top-level xfl/ folder. All are fetched and merged (dedup by
  // providerId) the same way other sports merge multiple upcoming feeds.
  scoresFeedPrefix: "football",
  oddsCategory: "football",
  upcomingFeeds: [
    "nfl-scores",
    "nfl-shedule",
    "fbs-scores",
    "fbs-shedule",
    "div3-scores",
    "div3-shedule",
    "fcs-scores",
    "fcs-shedule",
    "xfl/xfl-scores",
    "xfl/xfl-shedule",
  ],
});

export {
  getUpcomingRaw as getGoalServeAmfootballUpcomingRaw,
  getLiveRaw as getGoalServeAmfootballLiveRaw,
  attachOdds as attachGoalServeAmfootballOdds,
};
