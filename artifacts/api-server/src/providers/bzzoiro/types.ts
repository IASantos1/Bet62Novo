// sports.bzzoiro.com — types confirmed real via the user's own captured
// REST (GET /events/, GET /events/:id/stats/) and WebSocket (subscribed,
// event, livedata, action, odds, ingest_debug frames) responses,
// 2026-09-11 through 2026-09-14. Originally this provider existed for
// exactly one thing (real ball x/y for the mini pitch), since GOAL
// API/PulseScore already owned fixture discovery, odds, and stats — but a
// 2026-09-14 capture on the user's own paid plan confirmed bzzoiro's
// "odds" WS frame carries real match_winner/over_under/btts/asian_handicap
// prices (with a real per-line bookmaker_count), and GET /events/:id/stats/
// carries a full box score plus real xG, a shotmap, average positions, and
// an xG-per-minute timeline — richer than anything GOAL API/PulseScore
// gave BET62. GET /events/ (paginated, DRF {count,next,previous,results}
// shape) with ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD real params
// (confirmed 2026-09-14 — the status= param is still the dead one, per the
// note below) is bzzoiro's real prematch fixture list, richer than GOAL
// API's own (embedded head_to_head, weather, is_local_derby, etc.) — this
// is now being wired as BET62's primary football data source end to end
// (fixture discovery, odds, stats, ball position), replacing GOAL API and
// PulseScore for football.

/** One row of GET /events/live/ — enough to match a fixture against a live
 * GOAL API match by team name (see matchSync.ts). CORRECTION 2026-09-11:
 * the generic GET /events/ list (with a ?status= query param) silently
 * ignores that param server-side — it always returns the same fixed
 * dump of "notstarted" fixtures regardless of the filter, confirmed via
 * the user's own real requests (identical count/status distribution with
 * and without the param). The real live-events resource is this
 * dedicated /events/live/ path, confirmed via a real live response: its
 * in-progress status string is "inprogress" (not "live" as assumed
 * before), and it can also list a just-finished match ("finished"), so
 * callers still need to filter on `status === "inprogress"` themselves. */
export type BzzoiroEvent = {
  id: number;
  league_id: number;
  league_name: string;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
  event_date: string; // ISO
  status: string; // "inprogress" | "finished" | ...
  live_websocket: boolean;
};

/** GET /events/live/'s real response shape — {count, events}, NOT the
 * {count, next, previous, results} DRF-pagination shape assumed before
 * (that shape belonged to the generic, non-filtering /events/ list). */
export type BzzoiroEventsListResponse = {
  count: number;
  events: BzzoiroEvent[];
};

/** The WebSocket `livedata` frame — real ball position + situation, sent
 * roughly every ~5s per the docs, confirmed real via a live-captured frame.
 * IMPORTANT, unconfirmed assumption (flagged rather than silently assumed):
 * coordinates are read here as already being in the SAME "home defends
 * x≈0, home attacks x≈100" orientation FootballPitchTracker's own
 * zoneForAction already uses — i.e. used directly with no home/away
 * mirroring applied. This was inferred from the shape of the one real
 * captured match (home team's deep/safe play sat at low x, away team's own
 * deep/safe play sat at a similarly low x — consistent with a fixed
 * pitch-relative coordinate frame, not a per-team-attacking-direction
 * frame), not from an explicit statement in the docs or a captured
 * near-goal frame. Revisit if ball positions render clearly on the wrong
 * side once this ships. */
export type BzzoiroLiveDataFrame = {
  type: "livedata";
  event_id: number;
  uts: number;
  side: "home" | "away" | null;
  situation: string;
  coordinates: Array<{ x: number; y: number }>;
  commentary?: string;
};

export type BzzoiroEventFrame = {
  type: "event";
  event_id: number;
  home: { id: number; name: string; short_name?: string };
  away: { id: number; name: string; short_name?: string };
  score: { home: number; away: number };
  time: { minute: number; second: number; display: string; period: number; status: string };
  websocket_plus?: boolean;
};

export type BzzoiroSubscribedFrame = {
  type: "subscribed";
  event_id: number;
  source: "basic" | "full";
};

export type BzzoiroUnsubscribedFrame = { type: "unsubscribed"; event_id: number };
export type BzzoiroErrorFrame = { type: "error"; message?: string; code?: number };

/** Real "odds" WS frame (confirmed 2026-09-14, event_id 214594, "full" tier
 * — the paid plan's subscribedAck.source is "full" for every subscribe,
 * not gated per event). asian_handicap carries the WHOLE quarter-line grid
 * bet365-style bookmakers would split across several markets — bzzoiro
 * already flattens it into one array, each entry's bookmaker_count saying
 * how many real books fed that line. */
export type BzzoiroOddsFrame = {
  type: "odds";
  event_id: number;
  odds: {
    match_winner?: { home: number; draw: number; away: number };
    over_under?: Record<string, number>; // real keys confirmed: over_15/under_15/over_25/under_25/over_35/under_35
    btts?: { yes: number; no: number };
    asian_handicap?: Array<{
      line: number;
      push: "none" | "half" | "full";
      home: number;
      away: number;
      bookmaker_count: number;
    }>;
  };
  updated_at: string | null;
  next_update_at: string | null;
  update_reason: string | null;
};

export type BzzoiroWsFrame =
  | BzzoiroSubscribedFrame
  | BzzoiroUnsubscribedFrame
  | BzzoiroEventFrame
  | BzzoiroLiveDataFrame
  | BzzoiroOddsFrame
  | BzzoiroErrorFrame
  | { type: string; [k: string]: unknown }; // action/ingest_debug/etc — unused, kept loose

/** One row of GET /events/?date_from=...&date_to=... — bzzoiro's real
 * prematch fixture list (confirmed 2026-09-14; date_from/date_to are the
 * real working filter params — status= is the dead one documented on
 * BzzoiroEvent above). Only the fields BET62 actually reads are typed; the
 * real payload also carries round_name/group_name/stage/weather/
 * pitch_condition/attendance/highlights/etc this integration doesn't use
 * yet. */
export type BzzoiroUpcomingEvent = {
  id: number;
  league_id: number;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  venue_id: number | null;
  event_date: string; // ISO
  status: string; // "notstarted" for this endpoint's normal rows
  round_label: string | null;
  home_score: number | null;
  away_score: number | null;
  live_websocket: boolean;
  websocket_plus: boolean;
  has_xg: boolean;
  head_to_head?: {
    total_matches: number;
    home_wins: number;
    draws: number;
    away_wins: number;
    home_goals: number;
    away_goals: number;
  };
};

export type BzzoiroUpcomingEventsResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BzzoiroUpcomingEvent[];
};
