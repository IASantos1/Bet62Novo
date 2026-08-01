// Unified event model for the BET62 Live + Match Tracker + Streaming
// pipeline (BetBY live data + Statpal tracker + SMYTDRYT stream).
export interface LiveEvent {
  betbyEventId: string;
  videoMatchId?: number;
  sport: string;
  league: string;
  country: string;
  home: string;
  away: string;
  status: "LIVE" | "PREMATCH" | "FINISHED";
  minute?: string;
  homeScore?: number;
  awayScore?: number;
  // Tracker source is Statpal (already the platform's live-football data
  // provider), matched by team name at read time — not StatScore, which has
  // no real account/documentation for this project. See services/statpal/
  // liveTracker.ts.
  tracker?: {
    provider: "statpal";
    eventId: string;
  };
  stream?: {
    provider: "smytdryt";
    matchId: number;
    key: string;
    url: string;
  };
}
