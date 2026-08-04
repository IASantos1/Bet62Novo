// Shared Match Tracker shape — StatScore (primary, manual mapping),
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
  // SportScore only: a ready-to-embed iframe URL for their own animated
  // pitch/court widget (3D stylized field with live event pop-ups) — see
  // sportscoreMatchToTracker in routes/matches.ts. No odds/betting inside,
  // purely visual; confirmed via a real captured session (not documented
  // anywhere official, discovered from the "tracker":{id,profile,sport}
  // object nested in the /api/widget/match/ response).
  widgetUrl?: string;
}
