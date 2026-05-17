const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const BANNER_BASE = DOMAIN ? `https://${DOMAIN}` : "";

const TEAM_BANNER_FILES: Record<string, string> = {
  "FC Porto": "porto.jpg", "Porto": "porto.jpg",
  "Benfica": "benfica.jpg", "SL Benfica": "benfica.jpg",
  "Sporting CP": "sporting.jpg", "Sporting": "sporting.jpg",
  "Braga": "braga.jpg", "SC Braga": "braga.jpg",
  "Famalicão": "famalicao.jpg", "Famalicao": "famalicao.jpg", "FC Famalicão": "famalicao.jpg",
  "Gil Vicente": "gil-vicente.jpg",
  "Moreirense": "moreirense.jpg",
  "Vitória SC": "vitoria-sc.jpg", "Vitoria SC": "vitoria-sc.jpg",
  "Vitória de Guimarães": "vitoria-sc.jpg", "V. Guimaraes": "vitoria-sc.jpg",
  "Estoril Praia": "estoril.jpg", "Estoril": "estoril.jpg",
  "Alverca": "alverca.jpg", "FC Alverca": "alverca.jpg",
  "Inter": "inter.jpg", "Inter Milan": "inter.jpg", "Internazionale": "inter.jpg",
  "Milan": "milan.jpg", "AC Milan": "milan.jpg",
  "Juventus": "juventus.jpg",
  "Napoli": "napoli.jpg",
  "Roma": "roma.jpg", "AS Roma": "roma.jpg",
  "Lazio": "lazio.jpg", "SS Lazio": "lazio.jpg",
  "Atalanta": "atalanta.jpg",
  "Fiorentina": "fiorentina.jpg",
  "Bologna": "bologna.jpg",
  "Torino": "torino.jpg",
  "Como": "como.jpg", "Como 1907": "como.jpg",
  "Parma": "parma.jpg", "Parma Calcio": "parma.jpg",
  "Besiktas": "besiktas.jpg", "Beşiktaş": "besiktas.jpg",
  "Fenerbahce": "fenerbahce.jpg", "Fenerbahçe": "fenerbahce.jpg",
  "Galatasaray": "galatasaray.jpg",
  "Goztepe": "goztepe.jpg", "Göztepe": "goztepe.jpg",
  "Kocaelispor": "kocaelispor.jpg",
  "Konyaspor": "konyaspor.jpg",
  "Rizespor": "rizespor.jpg", "Caykur Rizespor": "rizespor.jpg", "Çaykur Rizespor": "rizespor.jpg",
  "Samsunspor": "samsunspor.jpg",
  "Trabzonspor": "trabzonspor.jpg",
  "Istanbul Basaksehir": "basaksehir.jpg", "Basaksehir": "basaksehir.jpg", "Başakşehir": "basaksehir.jpg",
  "Ipswich": "ipswich.jpg", "Ipswich Town": "ipswich.jpg",
  "Hull City": "hull.jpg", "Hull": "hull.jpg",
  "Derby County": "derby.jpg", "Derby": "derby.jpg",
  "Middlesbrough": "middlesbrough.jpg",
  "Coventry City": "coventry.jpg", "Coventry": "coventry.jpg",
  "Birmingham City": "birmingham.jpg", "Birmingham": "birmingham.jpg",
  "Leicester City": "leicester.jpg", "Leicester": "leicester.jpg",
  "Sheffield United": "sheffield-utd.jpg", "Sheffield Utd": "sheffield-utd.jpg",
  "Southampton": "southampton.jpg",
  "Wrexham": "wrexham.jpg",
  "Atlanta United": "atlanta-united.jpg",
  "Austin FC": "austin-fc.jpg",
  "Columbus Crew": "columbus-crew.jpg",
  "FC Cincinnati": "fc-cincinnati.jpg",
  "Inter Miami": "inter-miami.jpg",
  "LAFC": "lafc.jpg", "LA FC": "lafc.jpg",
  "LA Galaxy": "la-galaxy.jpg",
  "NYCFC": "nycfc.jpg", "New York City FC": "nycfc.jpg",
  "Portland Timbers": "portland-timbers.jpg",
  "Seattle Sounders": "seattle-sounders.jpg", "Seattle Sounders FC": "seattle-sounders.jpg",
};

export function getTeamBannerUrl(teamName: string): string | null {
  if (!BANNER_BASE) return null;
  const file = TEAM_BANNER_FILES[teamName];
  return file ? `${BANNER_BASE}/banners/${file}` : null;
}

export function getMatchBannerUrl(home: string, away: string): string | null {
  return getTeamBannerUrl(home) ?? getTeamBannerUrl(away);
}

export const LEAGUE_FLAGS: Record<string, string> = {
  "La Liga": "🇪🇸", "LaLiga": "🇪🇸", "LaLiga2": "🇪🇸", "LaLiga Hypermotion": "🇪🇸", "Segunda": "🇪🇸", "Copa del Rey": "🇪🇸",
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "EFL Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "League One": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "FA Cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Champions League": "⭐", "UEFA Champions League": "⭐", "Europa League": "🌟", "Conference League": "🟢",
  "Serie A": "🇮🇹", "Serie B": "🇮🇹", "Coppa Italia": "🇮🇹",
  "Bundesliga": "🇩🇪", "2. Bundesliga": "🇩🇪", "DFB-Pokal": "🇩🇪",
  "Ligue 1": "🇫🇷", "Ligue 2": "🇫🇷", "Coupe de France": "🇫🇷",
  "Liga Portugal": "🇵🇹", "Primeira Liga": "🇵🇹", "Segunda Liga": "🇵🇹", "Liga Portugal 2": "🇵🇹", "Taça de Portugal": "🇵🇹",
  "Eredivisie": "🇳🇱", "Eerste Divisie": "🇳🇱", "KNVB Cup": "🇳🇱",
  "Belgian Pro League": "🇧🇪", "Jupiler Pro League": "🇧🇪",
  "Süper Lig": "🇹🇷", "Super Lig": "🇹🇷", "TFF First League": "🇹🇷",
  "Scottish Premiership": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Scottish Championship": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Swiss Super League": "🇨🇭",
  "Danish Superliga": "🇩🇰",
  "Allsvenskan": "🇸🇪", "Superettan": "🇸🇪",
  "Eliteserien": "🇳🇴",
  "HNL": "🇭🇷",
  "Serbian SuperLiga": "🇷🇸",
  "Brasileirao": "🇧🇷", "Brasileirão": "🇧🇷", "Campeonato Brasileiro": "🇧🇷", "Copa do Brasil": "🇧🇷",
  "Primera División": "🇦🇷", "Primera Division": "🇦🇷",
  "Liga MX": "🇲🇽",
  "MLS": "🇺🇸", "NBA": "🇺🇸", "NHL": "🇺🇸", "MLB": "⚾", "USA: MLB": "⚾",
  "ATP 500": "🎾", "ATP 250": "🎾", "WTA 1000": "🎾", "WTA 250": "🎾", "Roland Garros": "🇫🇷",
  "NHL — Playoffs": "🏒",
  "Volleyball Nations League": "🏐", "Superlega — Itália": "🏐",
  "EuroLeague": "⭐",
};

const COUNTRY_FLAGS: Record<string, string> = {
  england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  spain: "🇪🇸", germany: "🇩🇪", italy: "🇮🇹", france: "🇫🇷",
  portugal: "🇵🇹", netherlands: "🇳🇱", belgium: "🇧🇪",
  austria: "🇦🇹", switzerland: "🇨🇭",
  turkey: "🇹🇷", greece: "🇬🇷",
  denmark: "🇩🇰", sweden: "🇸🇪", norway: "🇳🇴", finland: "🇫🇮",
  russia: "🇷🇺", ukraine: "🇺🇦", poland: "🇵🇱",
  croatia: "🇭🇷", serbia: "🇷🇸", czechia: "🇨🇿",
  usa: "🇺🇸", canada: "🇨🇦", mexico: "🇲🇽",
  brazil: "🇧🇷", argentina: "🇦🇷", colombia: "🇨🇴", chile: "🇨🇱", uruguay: "🇺🇾",
  israel: "🇮🇱", "saudi arabia": "🇸🇦",
};

export function getLeagueFlag(league?: string, country?: string): string {
  if (league && LEAGUE_FLAGS[league]) return LEAGUE_FLAGS[league]!;
  if (country && COUNTRY_FLAGS[country.toLowerCase()]) return COUNTRY_FLAGS[country.toLowerCase()]!;
  return "🏆";
}
