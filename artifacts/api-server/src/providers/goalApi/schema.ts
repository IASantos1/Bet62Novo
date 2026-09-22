export type GoalApiEnvelope<T> = {
  success: boolean;
  data: T;
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
};

export type GoalApiFixture = {
  id: string | number;
  league_id?: string | number;
  league_name?: string;
  country_name?: string;
  home_team_id?: string | number;
  away_team_id?: string | number;
  home_team_name?: string;
  away_team_name?: string;
  status?: string;
  match_status?: string;
  match_live?: string | number | boolean;
  matchDate?: string;
  matchTime?: string;
  kickoffUtc?: string;
  start_time?: string;
  score?: {
    home?: number | string;
    away?: number | string;
  };
  statistics?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type GoalApiFixtureList = GoalApiFixture[];

export type GoalApiWebhookPayload = {
  type?: string;
  event?: string;
  fixtureId?: string | number;
  fixture?: GoalApiFixture;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};
