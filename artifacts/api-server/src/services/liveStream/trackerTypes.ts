// Shared Match Tracker shape — StatScore (primary, manual mapping),
// Statpal (automated team-name match, live + statistics endpoint for
// minute/incidents), and PulseScore (last-resort automated fallback) all
// normalise into this exact shape so the frontend never needs to care
// which one answered a given request.
export interface MatchTracker {
  provider: "statscore" | "statpal" | "pulsescore";
  eventId: string;
  status: string;
  minute: string;
  homeScore: number;
  awayScore: number;
  incidents: Array<{ type: string; team: string; minute: number; player: string }>;
}
