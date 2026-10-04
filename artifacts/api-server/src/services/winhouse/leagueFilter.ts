import type { NormalizedListGame } from "./listGame.js";

// User-confirmed exclusions (2026-10-04): youth, women's, amateur and
// reserve-team fixtures never qualify for the Telegram promotion, whatever
// league they're in. Matched against league + both team names.
const YOUTH_PATTERN = /\bsub-?\d{1,2}\b|\bu-?\d{2}\b/i;
const WOMEN_PATTERN = /feminin[oa]|mulheres|\bwomen\b/i;
const AMATEUR_PATTERN = /amador|amateur/i;
const RESERVE_PATTERN = /\bii\b|\breservas?\b/i;

function isExcluded(game: NormalizedListGame): boolean {
  const haystack = `${game.league} ${game.homeTeam} ${game.awayTeam}`;
  return (
    YOUTH_PATTERN.test(haystack) ||
    WOMEN_PATTERN.test(haystack) ||
    AMATEUR_PATTERN.test(haystack) ||
    RESERVE_PATTERN.test(haystack)
  );
}

// Markers of a lower-tier/regional competition that must disqualify a game
// even if the league name also contains an allowed keyword below — e.g.
// "Espanha. Primeira Divisão RFEF. Grupo 1" contains "primeira divisão"
// but is Spain's 5th tier, not La Liga. Confirmed from real WinHouse data
// (2026-10-04) that this RFEF/Grupo pattern exists and must be excluded.
const SUB_TIER_DISQUALIFIER = /\brfef\b|\bgrupo\s*\d+\b|expansion|primera\s*[bc]\b|primeira\s*[bc]\b|\bb\s*nacional\b|\bc\s*metropolitana\b/i;

type AllowedLeague = {
  countries: string[];
  leagueKeywords: string[];
  tier: "grande" | "média";
};

// User-confirmed classification (2026-10-04). Entries marked "não
// confirmado" are a best-effort guess at WinHouse's naming for leagues
// that didn't happen to have a fixture in the sample 24h response we
// captured — adjust as real fixtures from these leagues come through,
// per the agreed incremental approach (this is a curated list, not a
// one-shot oracle).
const ALLOWED_LEAGUES: AllowedLeague[] = [
  // Grande
  { countries: ["inglaterra", "england"], leagueKeywords: ["premier league"], tier: "grande" },
  { countries: ["espanha", "spain"], leagueKeywords: ["la liga", "laliga"], tier: "grande" },
  { countries: ["itália", "italia", "italy"], leagueKeywords: ["serie a"], tier: "grande" },
  { countries: ["alemanha", "germany"], leagueKeywords: ["bundesliga"], tier: "grande" },
  { countries: ["frança", "franca", "france"], leagueKeywords: ["ligue 1"], tier: "grande" },
  { countries: ["holanda", "netherlands"], leagueKeywords: ["eredivisie"], tier: "grande" },
  { countries: ["portugal"], leagueKeywords: ["primeira liga"], tier: "grande" },
  { countries: ["brasil", "brazil"], leagueKeywords: ["série a", "serie a", "brasileirão", "brasileiro"], tier: "grande" },
  { countries: ["argentina"], leagueKeywords: ["primeira divisão", "primera división", "liga profesional"], tier: "grande" },
  { countries: [], leagueKeywords: ["champions league", "europa league"], tier: "grande" },
  // Média
  { countries: ["inglaterra", "england"], leagueKeywords: ["championship"], tier: "média" },
  { countries: ["espanha", "spain"], leagueKeywords: ["segunda divisão", "segunda división"], tier: "média" },
  { countries: ["itália", "italia", "italy"], leagueKeywords: ["serie b"], tier: "média" },
  { countries: ["alemanha", "germany"], leagueKeywords: ["2. bundesliga"], tier: "média" },
  { countries: ["frança", "france"], leagueKeywords: ["ligue 2"], tier: "média" },
  { countries: ["bélgica", "belgica", "belgium"], leagueKeywords: ["pro league"], tier: "média" },
  { countries: ["turquia", "turkey"], leagueKeywords: ["süper lig", "super lig"], tier: "média" },
  { countries: ["escócia", "escocia", "scotland"], leagueKeywords: ["premiership"], tier: "média" },
  { countries: ["méxico", "mexico"], leagueKeywords: ["liga mx"], tier: "média" }, // não confirmado
  { countries: ["estados unidos", "united states"], leagueKeywords: ["mls"], tier: "média" }, // não confirmado
  { countries: ["rússia", "russia"], leagueKeywords: ["premier league"], tier: "média" }, // não confirmado
  { countries: ["grécia", "grecia", "greece"], leagueKeywords: ["super league"], tier: "média" }, // não confirmado
  { countries: ["dinamarca", "denmark"], leagueKeywords: ["superliga"], tier: "média" }, // não confirmado
  { countries: ["áustria", "austria"], leagueKeywords: ["bundesliga"], tier: "média" }, // não confirmado
  { countries: ["suíça", "suica", "switzerland"], leagueKeywords: ["super league"], tier: "média" }, // não confirmado
  { countries: ["japão", "japao", "japan"], leagueKeywords: ["j1 league"], tier: "média" }, // não confirmado
  { countries: ["arábia saudita", "arabia saudita", "saudi arabia"], leagueKeywords: ["saudi pro league"], tier: "média" }, // não confirmado
  { countries: [], leagueKeywords: ["conference league", "libertadores", "sudamericana"], tier: "média" },
];

export type LeagueFilterResult =
  | { status: "included"; tier: "grande" | "média" }
  | { status: "excluded"; reason: "sport" | "excluded_keyword" | "sub_tier" | "not_in_allowed_list" };

// Football only for now (sport_id 1), per the step-by-step build — other
// sports need their own confirmed allowed-leagues list later.
const FOOTBALL_SPORT_ID = 1;

export function filterWinHouseListGame(game: NormalizedListGame): LeagueFilterResult {
  if (game.sportId !== FOOTBALL_SPORT_ID) return { status: "excluded", reason: "sport" };
  if (isExcluded(game)) return { status: "excluded", reason: "excluded_keyword" };
  if (SUB_TIER_DISQUALIFIER.test(game.league)) return { status: "excluded", reason: "sub_tier" };

  const leagueLower = game.league.toLowerCase();
  const countryLower = game.country.toLowerCase();
  for (const entry of ALLOWED_LEAGUES) {
    const countryMatches = entry.countries.length === 0 || entry.countries.some((c) => countryLower.includes(c) || leagueLower.includes(c));
    if (!countryMatches) continue;
    if (entry.leagueKeywords.some((k) => leagueLower.includes(k))) {
      return { status: "included", tier: entry.tier };
    }
  }
  return { status: "excluded", reason: "not_in_allowed_list" };
}
