// Shared Match Tracker shape — SportScore (automatic, free widget JSON),
// Statpal (automated team-name match, live + statistics endpoint for
// minute/incidents), and PulseScore (last-resort automated fallback) all
// normalise into this exact shape so the frontend never needs to care
// which one answered a given request.
export interface MatchTracker {
  provider: "statscore" | "statpal" | "pulsescore" | "sportscore";
  eventId: string;
  status: string;
  minute: string;
  homeScore: number;
  awayScore: number;
  incidents: Array<{ type: string; team: string; minute: number; player: string }>;
  homeFormation?: string | null;
  awayFormation?: string | null;
  homeHalfTimeScore?: number | null;
  awayHalfTimeScore?: number | null;
  lineupConfirmed?: boolean | null;
}
