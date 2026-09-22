import type {
  PulseScoreBookmaker,
  PulseScoreSport,
  PulseScoreTransport,
} from "../../providers/pulsescore/schema.js";

export type Bet62Sport =
  | "football"
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

export type MatchStateProvider = "goal-api" | "pulsescore" | "mrdoge";
export type OddsProvider = "pulsescore" | "mrdoge";

export type SportProviderConfig = {
  sport: Bet62Sport;
  pulseScoreSport: PulseScoreSport;
  bookmaker: PulseScoreBookmaker;
  transport: PulseScoreTransport;
  matchStateProvider: MatchStateProvider;
  oddsProvider: OddsProvider;
};

export const SPORT_PROVIDER_MATRIX: Record<Bet62Sport, SportProviderConfig> = {
  football: {
    sport: "football",
    pulseScoreSport: "soccer",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "goal-api",
    oddsProvider: "pulsescore",
  },
  tennis: {
    sport: "tennis",
    pulseScoreSport: "tennis",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  basketball: {
    sport: "basketball",
    pulseScoreSport: "basketball",
    bookmaker: "bet365",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  ice_hockey: {
    sport: "ice_hockey",
    pulseScoreSport: "ice_hockey",
    bookmaker: "bet365",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  volleyball: {
    sport: "volleyball",
    pulseScoreSport: "volleyball",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  handball: {
    sport: "handball",
    pulseScoreSport: "handball",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  table_tennis: {
    sport: "table_tennis",
    pulseScoreSport: "table_tennis",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  baseball: {
    sport: "baseball",
    pulseScoreSport: "baseball",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  american_football: {
    sport: "american_football",
    pulseScoreSport: "american_football",
    bookmaker: "bet365",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  cricket: {
    sport: "cricket",
    pulseScoreSport: "cricket",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  rugby_union: {
    sport: "rugby_union",
    pulseScoreSport: "rugby_union",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  rugby_league: {
    sport: "rugby_league",
    pulseScoreSport: "rugby_league",
    bookmaker: "bet365",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  esports: {
    sport: "esports",
    pulseScoreSport: "esports",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  boxing: {
    sport: "boxing",
    pulseScoreSport: "boxing",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  mma: {
    sport: "mma",
    pulseScoreSport: "mma",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  golf: {
    sport: "golf",
    pulseScoreSport: "golf",
    bookmaker: "1xbet",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  motorsports: {
    sport: "motorsports",
    pulseScoreSport: "motorsports",
    bookmaker: "1xbet",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  formula1: {
    sport: "formula1",
    pulseScoreSport: "formula1",
    bookmaker: "betano-de",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  snooker: {
    sport: "snooker",
    pulseScoreSport: "snooker",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  darts: {
    sport: "darts",
    pulseScoreSport: "darts",
    bookmaker: "betano-br",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  field_hockey: {
    sport: "field_hockey",
    pulseScoreSport: "field_hockey",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  futsal: {
    sport: "futsal",
    pulseScoreSport: "futsal",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  padel: {
    sport: "padel",
    pulseScoreSport: "padel",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  pickleball: {
    sport: "pickleball",
    pulseScoreSport: "pickleball",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  water_polo: {
    sport: "water_polo",
    pulseScoreSport: "water_polo",
    bookmaker: "1xbet",
    transport: "websocket",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  horse_racing: {
    sport: "horse_racing",
    pulseScoreSport: "horse_racing",
    bookmaker: "bet365",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
  greyhounds: {
    sport: "greyhounds",
    pulseScoreSport: "greyhounds",
    bookmaker: "pulsescore",
    transport: "rest",
    matchStateProvider: "pulsescore",
    oddsProvider: "pulsescore",
  },
};

export function getSportProviderConfig(
  sport: Bet62Sport,
): SportProviderConfig {
  return SPORT_PROVIDER_MATRIX[sport];
}
