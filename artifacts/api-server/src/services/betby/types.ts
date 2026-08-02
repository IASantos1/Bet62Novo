import type { MatchTracker } from "../liveStream/trackerTypes.js";

// Unified "LiveAggregator" event model for the BET62 Live + Match Tracker +
// Streaming pipeline: one object per live event carrying everything the
// frontend needs (tracker + stream embedded inline, not references the
// client has to poll separately) — GET /api/live is the single source of
// truth, BetBY/StatScore/PulseScore/SMYTDRYT specifics stay entirely
// server-side.
export interface LiveEvent {
  // StatScore's eventId when an admin has mapped one (tracker.provider ===
  // "statscore"), otherwise PulseScore's eventId when the automatic
  // team-name fallback found one (tracker.provider === "pulsescore"). See
  // services/betby/poller.ts for the resolution order.
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
