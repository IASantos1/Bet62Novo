export interface MajorLeague {
  patterns: string[];
  label: string;
  sport: string;
  logo: string;
  color: string;
}

export const MAJOR_LEAGUES: MajorLeague[] = [
  { patterns: ["champions league", "liga dos campeões", "liga campeões", "champions"], label: "Champions", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/7/image", color: "#001489" },
  { patterns: ["europa league", "liga europa"], label: "Europa League", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/679/image", color: "#F77F00" },
  { patterns: ["conference league", "liga conferência", "uecl"], label: "Conference", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/17015/image", color: "#00B386" },
  { patterns: ["premier league"], label: "Premier League", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/17/image", color: "#3D195B" },
  { patterns: ["la liga", "laliga"], label: "La Liga", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/8/image", color: "#FF4B44" },
  { patterns: ["bundesliga"], label: "Bundesliga", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/35/image", color: "#D3010C" },
  { patterns: ["serie a"], label: "Serie A", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/23/image", color: "#024494" },
  { patterns: ["ligue 1", "ligue1"], label: "Ligue 1", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/34/image", color: "#243F8B" },
  { patterns: ["primeira liga", "liga portugal", "liga nos", "liga bwin", "bwin liga"], label: "Primeira Liga", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/238/image", color: "#00924B" },
  { patterns: ["eredivisie"], label: "Eredivisie", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/37/image", color: "#D00000" },
  { patterns: ["super lig", "süper lig", "superlig"], label: "Süper Lig", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/52/image", color: "#E30A17" },
  { patterns: ["liga mx"], label: "Liga MX", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/11521/image", color: "#013369" },
  { patterns: ["mls"], label: "MLS", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/242/image", color: "#003087" },
  { patterns: ["brasileirao", "brasileirão", "campeonato brasileiro", "série a brasil", "serie a brasil", "brasileira"], label: "Brasileirão", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/325/image", color: "#009C3B" },
  { patterns: ["copa libertadores", "libertadores"], label: "Libertadores", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/384/image", color: "#006B3F" },
  { patterns: ["fa cup"], label: "FA Cup", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/4/image", color: "#3C1F78" },
  { patterns: ["copa del rey"], label: "Copa del Rey", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/329/image", color: "#FFCC02" },
  { patterns: ["coppa italia"], label: "Coppa Italia", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/471/image", color: "#009246" },
  { patterns: ["dfb pokal", "dfl pokal"], label: "DFB Pokal", sport: "football", logo: "https://api.sofascore.app/api/v1/unique-tournament/74/image", color: "#D3010C" },
  { patterns: ["nba"], label: "NBA", sport: "basketball", logo: "https://api.sofascore.app/api/v1/unique-tournament/132/image", color: "#006BB6" },
  { patterns: ["nhl"], label: "NHL", sport: "hockey", logo: "https://api.sofascore.app/api/v1/unique-tournament/123/image", color: "#17468C" },
  { patterns: ["mlb"], label: "MLB", sport: "baseball", logo: "https://api.sofascore.app/api/v1/unique-tournament/64/image", color: "#003087" },
  { patterns: ["wimbledon"], label: "Wimbledon", sport: "tennis", logo: "https://api.sofascore.app/api/v1/unique-tournament/1549/image", color: "#3D1F3A" },
  { patterns: ["roland garros", "french open"], label: "Roland Garros", sport: "tennis", logo: "https://api.sofascore.app/api/v1/unique-tournament/2480/image", color: "#B75A3A" },
  { patterns: ["us open"], label: "US Open", sport: "tennis", logo: "https://api.sofascore.app/api/v1/unique-tournament/2429/image", color: "#003087" },
  { patterns: ["australian open"], label: "Australian Open", sport: "tennis", logo: "https://api.sofascore.app/api/v1/unique-tournament/2478/image", color: "#00AEEF" },
  { patterns: ["atp 1000", "masters 1000", "rolex masters", "monte-carlo", "monte carlo", "madrid open", "italy open", "canada open", "cincinnati"], label: "ATP Masters", sport: "tennis", logo: "https://api.sofascore.app/api/v1/unique-tournament/1541/image", color: "#2C5F8B" },
  { patterns: ["atp finals", "nitto atp"], label: "ATP Finals", sport: "tennis", logo: "https://api.sofascore.app/api/v1/unique-tournament/1560/image", color: "#1A3A5C" },
  { patterns: ["serie a volleyball", "volleyball serie a", "superliga volei", "superliga vôlei"], label: "Superliga", sport: "volleyball", logo: "https://api.sofascore.app/api/v1/unique-tournament/639/image", color: "#6D28D9" },
  { patterns: ["volleyball nations league", "vnl"], label: "VNL", sport: "volleyball", logo: "https://api.sofascore.app/api/v1/unique-tournament/1000/image", color: "#4338CA" },
];

export function findMajorLeague(leagueName: string): MajorLeague | undefined {
  const name = leagueName.toLowerCase();
  return MAJOR_LEAGUES.find(ml => ml.patterns.some(p => name.includes(p)));
}
