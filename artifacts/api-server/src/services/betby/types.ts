import type { MatchTracker } from "../statpal/liveTracker.js";

// Unified "LiveAggregator" event model for the BET62 Live + Match Tracker +
// Streaming pipeline: one object per live event carrying everything the
// frontend needs (tracker + stream embedded inline, not references the
// client has to poll separately) — GET /api/live is the single source of
// truth, BetBY/Statpal/SMYTDRYT specifics stay entirely server-side.
export interface LiveEvent {
  // Statpal's internal match id when a tracker match was found — the
  // closest equivalent to a "StatScore eventId" available here, since no
  // real StatScore account/documentation exists for this project (see
  // services/statpal/liveTracker.ts's doc comment).
  eventId?: string;
  betbyEventId: string;
  videoMatchId?: number;
  sport: string;
  league: string;
  country: string;
  home: string;
  away: string;
  status: "LIVE" | "PREMATCH" | "FINISHED";
  minute?: string;
  score: { home: number; away: number };
  tracker?: MatchTracker;
  stream?: { hls: string };
}
