export type PulseScoreBookmaker =
  | "1xbet"
  | "bet365"
  | "betano-de"
  | "betano-br"
  | "pulsescore";

export type PulseScoreTransport = "rest" | "websocket";

export type PulseScoreSport =
  | "soccer"
  | "tennis"
  | "basketball"
  | "ice_hockey"
  | "volleyball"
  | "handball"
  | "table_tennis"
  | "baseball"
  | "american_football"
  | "cricket"
  | "rugby_union"
  | "rugby_league"
  | "esports"
  | "boxing"
  | "mma"
  | "golf"
  | "motorsports"
  | "formula1"
  | "snooker"
  | "darts"
  | "field_hockey"
  | "futsal"
  | "padel"
  | "pickleball"
  | "water_polo"
  | "horse_racing"
  | "greyhounds";

export type PulseScoreSelection = {
  selectionId?: string;
  canonicalOutcome?: string;
  name?: string;
  rawName: string;
  odds?: number;
  line?: number | string | null;
  isActive?: boolean;
};

export type PulseScoreMarket = {
  marketId?: string;
  canonicalMarket?: string;
  rawName: string;
  period?: string;
  line?: number | string | null;
  isActive?: boolean;
  selections: PulseScoreSelection[];
};

export type PulseScoreEvent = {
  eventId: string;
  sport: string;
  country?: string;
  league?: string;
  home: string;
  away: string;
  live?: boolean;
  startTime?: string;
  score?: {
    home?: string | number;
    away?: string | number;
    info?: string;
  };
  matchClock?: {
    minute?: number;
    second?: number;
    period?: string;
    periodId?: string;
  };
  statistics?: Record<string, unknown>;
  markets?: PulseScoreMarket[];
  moreInfo?: Record<string, unknown>;
};

export type PulseScoreListResponse = {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  sport?: string;
  events?: PulseScoreEvent[];
};

export type PulseScoreItemResponse<T> = {
  data?: T | null;
};
