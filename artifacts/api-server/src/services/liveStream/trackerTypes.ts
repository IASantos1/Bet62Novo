// Shared Match Tracker shape — both StatScore (services/statscore/tracker.ts,
// the primary source when an admin has mapped a statscoreEventId) and
// Statpal (services/statpal/liveTracker.ts, the automatic zero-setup
// fallback matched by team name) normalize into this exact shape so the
// frontend never needs to care which one answered a given request.
export interface MatchTracker {
  provider: "statscore" | "statpal";
  eventId: string;
  status: string;
  minute: string;
  homeScore: number;
  awayScore: number;
  incidents: Array<{ type: string; team: string; minute: number; player: string }>;
}
