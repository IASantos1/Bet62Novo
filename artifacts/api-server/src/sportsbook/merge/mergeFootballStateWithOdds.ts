import type { GoalApiFixture } from "../../providers/goalApi/schema.js";
import type { PulseScoreEvent, PulseScoreMarket } from "../../providers/pulsescore/schema.js";

export type MergedFootballEvent = {
  id: string;
  sport: "football";
  league: string;
  country?: string;
  home: string;
  away: string;
  startTime?: string;
  status?: string;
  live: boolean;
  score: {
    home: number;
    away: number;
  };
  statistics?: Record<string, unknown>;
  incidents?: Array<Record<string, unknown>>;
  markets: PulseScoreMarket[];
  providers: {
    matchStateProvider: "goal-api";
    oddsProvider: "pulsescore";
    matchStateExternalId?: string;
    oddsExternalId?: string;
  };
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeFootballStateWithOdds(
  fixture: GoalApiFixture | null,
  oddsEvent: PulseScoreEvent | null,
): MergedFootballEvent | null {
  if (!fixture && !oddsEvent) return null;
  const matchStateId =
    fixture != null && fixture.id != null ? String(fixture.id) : undefined;
  const oddsId =
    oddsEvent != null && oddsEvent.eventId != null
      ? String(oddsEvent.eventId)
      : undefined;
  const home =
    String(
      fixture?.home_team_name ??
        oddsEvent?.home ??
        "",
    ).trim();
  const away =
    String(
      fixture?.away_team_name ??
        oddsEvent?.away ??
        "",
    ).trim();
  if (!home || !away) return null;
  return {
    id: matchStateId ?? oddsId ?? `${home}::${away}`,
    sport: "football",
    league: String(
      fixture?.league_name ??
        oddsEvent?.league ??
        "",
    ).trim(),
    country: String(
      fixture?.country_name ??
        oddsEvent?.country ??
        "",
    ).trim() || undefined,
    home,
    away,
    startTime: String(
      fixture?.start_time ??
        oddsEvent?.startTime ??
        "",
    ).trim() || undefined,
    status: String(fixture?.status ?? oddsEvent?.matchClock?.period ?? "").trim() || undefined,
    live: Boolean(oddsEvent?.live) || /live|half|period|minute/i.test(String(fixture?.status ?? "")),
    score: {
      home: toNumber(fixture?.score?.home ?? oddsEvent?.score?.home),
      away: toNumber(fixture?.score?.away ?? oddsEvent?.score?.away),
    },
    statistics:
      (fixture?.statistics as Record<string, unknown> | undefined) ??
      (oddsEvent?.statistics as Record<string, unknown> | undefined),
    incidents: Array.isArray(fixture?.events)
      ? fixture.events
      : undefined,
    markets: Array.isArray(oddsEvent?.markets) ? oddsEvent.markets : [],
    providers: {
      matchStateProvider: "goal-api",
      oddsProvider: "pulsescore",
      matchStateExternalId: matchStateId,
      oddsExternalId: oddsId,
    },
  };
}
