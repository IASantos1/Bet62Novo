// PulseScore (api.pulsescore.net) response shapes — confirmed real via 5
// endpoints the user pasted 2026-09-10 (raw curl + response JSON):
//   GET /api/onexbet/soccer/leagues?page&limit
//   GET /api/onexbet/soccer/events?page&limit
//   GET /api/onexbet/soccer/events/:id
//   GET /api/onexbet/live-events?page&limit&sport=soccer
//   GET /api/onexbet/live-events/events/:id
//
// PulseScore has ALREADY normalized markets/outcomes on its own side
// (canonicalMarket/canonicalOutcome), unlike GOAL API/api-tennis which
// hand back provider-native shapes BET62 has to interpret itself. This
// file only types what was actually observed — do not add fields or
// sports beyond what's confirmed (statistics is only confirmed for
// soccer/football; other sports may shape it differently).

export type PulseScoreSelection = {
  canonicalOutcome: string;
  rawName: string;
  odds: number;
  rawOdds: string;
  isActive: boolean;
  selectionId: string;
  /** Present on line-based markets (over/under, handicaps) — absent on
   * markets with no line (1X2, double chance, odd/even). */
  line?: number;
};

export type PulseScoreMarket = {
  canonicalMarket: string;
  rawName: string;
  period: string;
  /** Occasionally present at the market level too (mirrors the line
   * shared by every selection under it), confirmed on Both Teams To
   * Score/Double Chance + Total. */
  line?: number;
  isActive: boolean;
  selections: PulseScoreSelection[];
  /** Not always a bare number — period-scoped markets (e.g. "2nd half")
   * prefix it with a sub-game id, observed as "751553758:1". Treat as an
   * opaque string, never parse it as a number. */
  marketId: string;
  moreInfo?: {
    groupId: number;
    betTypes: number[];
  };
};

export type PulseScoreEventMoreInfo = {
  sportId: number;
  leagueId: number;
  selectionCount: number;
  currentPeriod?: string;
  subGames?: {
    expected: number;
    answered: number;
    markets: number;
  };
};

export type PulseScoreMatchClock = {
  minute: number;
  second: number;
  period: string;
  periodId: string;
};

export type PulseScoreScore = {
  home: string;
  away: string;
  info?: string;
};

/** Only "football" confirmed real so far (the key PulseScore uses even
 * though the event's own `sport` field says "soccer") — do not assume
 * other sports share this shape. */
export type PulseScoreStatistics = {
  football?: {
    home: { yellowCards: number; redCards: number; corners: number };
    away: { yellowCards: number; redCards: number; corners: number };
  };
};

/** Shared shape across every place an event appears: the soccer/events
 * and soccer/leagues listings, both singular detail endpoints, and the
 * live-events listing. matchClock/score/statistics are only populated on
 * the live-events family; `live` is only present on the soccer/* family
 * (the live-events endpoints imply it by construction instead). */
export type PulseScoreEvent = {
  eventId: string;
  home: string;
  away: string;
  league: string;
  sport: string;
  startTime: string;
  live?: boolean;
  markets: PulseScoreMarket[];
  moreInfo: PulseScoreEventMoreInfo;
  matchClock?: PulseScoreMatchClock;
  score?: PulseScoreScore;
  statistics?: PulseScoreStatistics;
};

export type PulseScorePage<T> = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
} & T;

export type PulseScoreLeague = {
  sport: string;
  name: string;
  events: PulseScoreEvent[];
};

export type PulseScoreLeaguesResponse = PulseScorePage<{ leagues: PulseScoreLeague[] }>;
export type PulseScoreEventsResponse = PulseScorePage<{ events: PulseScoreEvent[] }>;
export type PulseScoreLiveEventsResponse = PulseScorePage<{ sport: string; events: PulseScoreEvent[] }>;

export type PulseScoreEventDetailResponse = { data: PulseScoreEvent };
