export type GoalServeCanonicalOutcome =
  | "HOME"
  | "DRAW"
  | "AWAY"
  | "OVER"
  | "UNDER"
  | "DOUBLE_1X"
  | "DOUBLE_X2"
  | "DOUBLE_12"
  | "BTTS_YES"
  | "BTTS_NO"
  | "CORRECT_SCORE"
  | string;

export type ProviderRawOddsSelection = {
  canonicalOutcome: GoalServeCanonicalOutcome;
  canonicalMarket: string;
  label: string;
  odd: number;
  line?: number;
  score?: { home: number; away: number };
  rawMarketName: string;
  rawBookmaker: string;
};

export type ProviderRawFixture = {
  providerId: string;
  matchId: string;
  sport:
    | "soccer"
    | "tennis"
    | "basketball"
    | "hockey"
    | "baseball"
    | "volleyball"
    | "mma"
    | "boxing"
    | "handball"
    | "cricket"
    | "rugby"
    | "esports"
    | "amfootball"
    | "futsal"
    | "darts";
  home: string;
  away: string;
  league: string;
  country: string;
  kickoffISO: string;
  kickoffTimestamp: number;
  stateId: 0 | 1 | 2 | 3 | 5 | 22 | 99;
  score?: { home: number; away: number };
  liveMinute?: number;
  liveClockSec?: number;
  liveClockStr?: string;
  livePeriod?: string;
  liveRunning?: boolean;
  homeTeamId?: string;
  awayTeamId?: string;
  odds?: ProviderRawOddsSelection[];
};
