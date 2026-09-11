// sports.bzzoiro.com — types confirmed real via the user's own captured
// REST (GET /events/, GET /events/:id/stats/) and WebSocket (subscribed,
// event, livedata, action, odds, ingest_debug frames) responses,
// 2026-09-11. Only the fields BET62 actually reads are typed — every real
// response carries many more (stats blocks, shotmap, odds, etc.) that this
// integration never touches, since GOAL API/PulseScore already own that
// data for BET62's purposes. This provider exists for exactly one thing:
// real ball x/y to drive the mini pitch tracker.

/** One row of GET /events/ — enough to match a fixture against a live
 * GOAL API match by team name (see matchSync.ts). */
export type BzzoiroEvent = {
  id: number;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
  event_date: string; // ISO
  status: string; // "live" | "finished" | "upcoming" | ...
};

export type BzzoiroEventsListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BzzoiroEvent[];
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

export type BzzoiroWsFrame =
  | BzzoiroSubscribedFrame
  | BzzoiroUnsubscribedFrame
  | BzzoiroEventFrame
  | BzzoiroLiveDataFrame
  | BzzoiroErrorFrame
  | { type: string; [k: string]: unknown }; // action/odds/ingest_debug/etc — unused, kept loose
