const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const BANNER_BASE = DOMAIN ? `https://${DOMAIN}` : "";

const TEAM_BANNER_FILES: Record<string, string> = {
  // ── Liga Portugal ──
  "FC Porto": "porto.jpg", "Porto": "porto.jpg",
  "Benfica": "benfica.jpg", "SL Benfica": "benfica.jpg",
  "Sporting CP": "sporting.jpg", "Sporting": "sporting.jpg",
  "Braga": "braga.jpg", "SC Braga": "braga.jpg",
  "Famalicão": "famalicao.jpg", "Famalicao": "famalicao.jpg", "FC Famalicão": "famalicao.jpg",
  "Gil Vicente": "gil-vicente.jpg",
  "Moreirense": "moreirense.jpg",
  "Vitória SC": "vitoria-sc.jpg", "Vitoria SC": "vitoria-sc.jpg",
  "Vitória de Guimarães": "vitoria-sc.jpg", "Vitoria Guimaraes": "vitoria-sc.jpg",
  "Vitória Guimarães": "vitoria-sc.jpg", "V. Guimaraes": "vitoria-sc.jpg",
  "Estoril Praia": "estoril.jpg", "Estoril": "estoril.jpg",
  "Alverca": "alverca.jpg", "FC Alverca": "alverca.jpg",
  // ── Serie A ──
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
  // ── La Liga ──
  "Real Madrid": "real-madrid.jpeg",
  "Barcelona": "file_1778704789962_1778715064131.jpeg",
  "Atlético de Madrid": "file_1778704794042_1778715064131.jpeg",
  "Atletico Madrid": "file_1778704794042_1778715064131.jpeg",
  "Atletico de Madrid": "file_1778704794042_1778715064131.jpeg",
  "Atl. Madrid": "file_1778704794042_1778715064131.jpeg",
  "Athletic Club": "file_1778704805773_1778715064131.jpeg",
  "Athletic Bilbao": "file_1778704805773_1778715064131.jpeg",
  "Ath Bilbao": "file_1778704805773_1778715064131.jpeg",
  "Real Sociedad": "file_1778704817279_1778715064131.jpeg",
  "Sevilla": "file_1778704825793_1778715064131.jpeg",
  "Valencia": "file_1778704789962_1778715064131.jpeg",
  "Villarreal": "file_1778704794042_1778715064131.jpeg",
  "Real Betis": "file_1778704805773_1778715064131.jpeg",
  "Betis": "file_1778704805773_1778715064131.jpeg",
  "Girona": "file_1778704817279_1778715064131.jpeg",
  "Osasuna": "file_1778704789962_1778715064131.jpeg",
  "CA Osasuna": "file_1778704789962_1778715064131.jpeg",
  "Mallorca": "file_1778704794042_1778715064131.jpeg",
  "RCD Mallorca": "file_1778704794042_1778715064131.jpeg",
  "Getafe": "file_1778704805773_1778715064131.jpeg",
  "Getafe CF": "file_1778704805773_1778715064131.jpeg",
  "Rayo Vallecano": "file_1778704817279_1778715064131.jpeg",
  "Celta Vigo": "file_1778704825793_1778715064131.jpeg",
  "RC Celta": "file_1778704825793_1778715064131.jpeg",
  "Celta": "file_1778704825793_1778715064131.jpeg",
  "Deportivo Alaves": "file_1778704789962_1778715064131.jpeg",
  "Alavés": "file_1778704789962_1778715064131.jpeg",
  "Alaves": "file_1778704789962_1778715064131.jpeg",
  "Las Palmas": "file_1778704794042_1778715064131.jpeg",
  "UD Las Palmas": "file_1778704794042_1778715064131.jpeg",
  "Espanyol": "file_1778704805773_1778715064131.jpeg",
  "RCD Espanyol": "file_1778704805773_1778715064131.jpeg",
  "Valladolid": "file_1778704817279_1778715064131.jpeg",
  "Real Valladolid": "file_1778704817279_1778715064131.jpeg",
  "Leganes": "file_1778704825793_1778715064131.jpeg",
  "CD Leganes": "file_1778704825793_1778715064131.jpeg",
  "Leganés": "file_1778704825793_1778715064131.jpeg",
  // ── Premier League ──
  "Arsenal": "arsenal.jpeg",
  "Man City": "man-city.jpeg", "Manchester City": "man-city.jpeg",
  "Man Utd": "man-united.jpeg", "Manchester United": "man-united.jpeg", "Manchester Utd": "man-united.jpeg",
  "Liverpool": "liverpool.jpeg",
  "Aston Villa": "aston-villa.jpeg",
  "Bournemouth": "bournemouth.jpeg", "AFC Bournemouth": "bournemouth.jpeg",
  "Brentford": "brentford.jpeg",
  "Brighton": "brighton.jpeg", "Brighton & Hove Albion": "brighton.jpeg",
  "Chelsea": "chelsea.jpeg",
  "Everton": "everton.jpeg",
  // ── EFL Championship ──
  "Ipswich": "ipswich.jpg", "Ipswich Town": "ipswich.jpg",
  "Hull City": "hull.jpg", "Hull": "hull.jpg",
  "Derby County": "derby.jpg", "Derby": "derby.jpg",
  "Middlesbrough": "middlesbrough.jpg", "Boro": "middlesbrough.jpg",
  "Coventry City": "coventry.jpg", "Coventry": "coventry.jpg",
  "Birmingham City": "birmingham.jpg", "Birmingham": "birmingham.jpg",
  "Leicester City": "leicester.jpg", "Leicester": "leicester.jpg",
  "Sheffield United": "sheffield-utd.jpg", "Sheffield Utd": "sheffield-utd.jpg", "Sheff Utd": "sheffield-utd.jpg",
  "Southampton": "southampton.jpg",
  "Wrexham": "wrexham.jpg", "Wrexham AFC": "wrexham.jpg",
  // ── Süper Lig (Turkey) ──
  "Besiktas": "besiktas.jpg", "Beşiktaş": "besiktas.jpg", "Besiktas JK": "besiktas.jpg",
  "Fenerbahce": "fenerbahce.jpg", "Fenerbahçe": "fenerbahce.jpg", "Fenerbahce SK": "fenerbahce.jpg",
  "Galatasaray": "galatasaray.jpg", "Galatasaray SK": "galatasaray.jpg",
  "Goztepe": "goztepe.jpg", "Göztepe": "goztepe.jpg", "Goztepe SK": "goztepe.jpg",
  "Kocaelispor": "kocaelispor.jpg",
  "Konyaspor": "konyaspor.jpg", "Atiker Konyaspor": "konyaspor.jpg",
  "Rizespor": "rizespor.jpg", "Caykur Rizespor": "rizespor.jpg", "Çaykur Rizespor": "rizespor.jpg",
  "Samsunspor": "samsunspor.jpg",
  "Trabzonspor": "trabzonspor.jpg", "Trabzon": "trabzonspor.jpg",
  "Istanbul Basaksehir": "basaksehir.jpg", "Basaksehir": "basaksehir.jpg", "Başakşehir": "basaksehir.jpg",
  "Istanbul BB": "basaksehir.jpg", "Medipol Basaksehir": "basaksehir.jpg",
  // ── MLS ──
  "Atlanta United": "atlanta-united.jpg", "Atlanta United FC": "atlanta-united.jpg",
  "Austin FC": "austin-fc.jpg",
  "Columbus Crew": "columbus-crew.jpg",
  "FC Cincinnati": "fc-cincinnati.jpg",
  "Inter Miami": "inter-miami.jpg", "Inter Miami CF": "inter-miami.jpg",
  "LAFC": "lafc.jpg", "LA FC": "lafc.jpg", "Los Angeles FC": "lafc.jpg",
  "LA Galaxy": "la-galaxy.jpg", "Los Angeles Galaxy": "la-galaxy.jpg",
  "NYCFC": "nycfc.jpg", "New York City FC": "nycfc.jpg", "NYC FC": "nycfc.jpg",
  "Portland Timbers": "portland-timbers.jpg",
  "Seattle Sounders": "seattle-sounders.jpg", "Seattle Sounders FC": "seattle-sounders.jpg",
  // ── Liga MX ──
  "Cruz Azul": "file_1778704794042_1778715064131.jpeg",
  "Club Cruz Azul": "file_1778704794042_1778715064131.jpeg",
  "Guadalajara": "file_1778704789962_1778715064131.jpeg",
  "Chivas": "file_1778704789962_1778715064131.jpeg",
  "Club Guadalajara": "file_1778704789962_1778715064131.jpeg",
  "Chivas Guadalajara": "file_1778704789962_1778715064131.jpeg",
  "León": "file_1778704817279_1778715064131.jpeg",
  "Leon": "file_1778704817279_1778715064131.jpeg",
  "Club León": "file_1778704817279_1778715064131.jpeg",
  "Club Leon": "file_1778704817279_1778715064131.jpeg",
  "Tigres UANL": "file_1778704805773_1778715064131.jpeg",
  "Tigres U.A.N.L.": "file_1778704805773_1778715064131.jpeg",
  "Tigres": "file_1778704805773_1778715064131.jpeg",
  "Pachuca": "file_1778704825793_1778715064131.jpeg",
  "C.F. Pachuca": "file_1778704825793_1778715064131.jpeg",
  "CF Pachuca": "file_1778704825793_1778715064131.jpeg",
  "Tuzos": "file_1778704825793_1778715064131.jpeg",
  // ── Argentina ──
  "River Plate": "river-plate.png",
  "Boca Juniors": "boca-juniors.png",
  "Racing Club": "racing-club.png", "Racing": "racing-club.png",
  "Independiente": "independiente.png",
  "San Lorenzo": "san-lorenzo.png",
  "Vélez Sarsfield": "velez.png", "Velez Sarsfield": "velez.png", "Vélez": "velez.png", "Velez": "velez.png",
  "Estudiantes": "estudiantes.png", "Estudiantes LP": "estudiantes.png",
  "Rosario Central": "rosario-central.png",
  "Lanús": "lanus.png", "Lanus": "lanus.png",
  "Talleres": "talleres.png", "Talleres Córdoba": "talleres.png",
  // ── Brasileirão ──
  "Palmeiras": "palmeiras.jpeg", "SE Palmeiras": "palmeiras.jpeg",
  "Flamengo": "flamengo.jpeg", "CR Flamengo": "flamengo.jpeg",
  "São Paulo": "sao-paulo.jpeg", "Sao Paulo": "sao-paulo.jpeg",
  "São Paulo FC": "sao-paulo.jpeg", "Sao Paulo FC": "sao-paulo.jpeg", "SPFC": "sao-paulo.jpeg",
  "Fluminense": "fluminense.jpeg", "Fluminense FC": "fluminense.jpeg",
  "Bahia": "bahia.jpeg", "EC Bahia": "bahia.jpeg",
  "Athletico Paranaense": "athletico-pr.jpeg", "Athletico-PR": "athletico-pr.jpeg",
  "Club Athletico Paranaense": "athletico-pr.jpeg", "Athletico PR": "athletico-pr.jpeg", "CAP": "athletico-pr.jpeg",
  "Coritiba": "coritiba.jpeg", "Coritiba FC": "coritiba.jpeg",
  "Atlético Mineiro": "atletico-mg.jpeg", "Atletico Mineiro": "atletico-mg.jpeg",
  "Atlético-MG": "atletico-mg.jpeg", "Atletico MG": "atletico-mg.jpeg", "CAM": "atletico-mg.jpeg",
  "Red Bull Bragantino": "bragantino.jpeg", "Bragantino": "bragantino.jpeg",
  "RB Bragantino": "bragantino.jpeg", "Red Bull Bragantino BR": "bragantino.jpeg",
  "Vitória": "vitoria-ba.jpeg", "Vitoria": "vitoria-ba.jpeg",
  "EC Vitória": "vitoria-ba.jpeg", "EC Vitoria": "vitoria-ba.jpeg",
  "Botafogo": "botafogo.jpeg", "Botafogo RJ": "botafogo.jpeg", "Botafogo FR": "botafogo.jpeg",
  "Grêmio": "gremio.jpeg", "Gremio": "gremio.jpeg", "Grêmio FBPA": "gremio.jpeg",
  "Vasco da Gama": "vasco.jpeg", "Vasco": "vasco.jpeg", "CR Vasco da Gama": "vasco.jpeg",
  "Santos": "santos.jpeg", "Santos FC": "santos.jpeg",
  "Corinthians": "corinthians.jpeg", "SC Corinthians": "corinthians.jpeg",
  "Cruzeiro": "cruzeiro.jpeg", "Cruzeiro EC": "cruzeiro.jpeg",
  "Clube do Remo": "remo.jpeg", "Club do Remo": "remo.jpeg", "Remo": "remo.jpeg",
  "Chapecoense": "chapecoense.jpeg", "Chapecoense-SC": "chapecoense.jpeg",
  "Mirassol": "mirassol.jpeg", "Mirassol FC": "mirassol.jpeg",
  // ── Ligue 1 (France) ──
  "PSG": "psg.jpeg", "Paris Saint-Germain": "psg.jpeg", "Paris SG": "psg.jpeg",
  "Paris FC": "paris-fc.jpeg",
  "Lyon": "lyon.jpeg", "Olympique Lyon": "lyon.jpeg", "Olympique Lyonnais": "lyon.jpeg",
  "Lens": "lens.jpeg", "RC Lens": "lens.jpeg",
  "Strasbourg": "strasbourg.jpeg", "RC Strasbourg": "strasbourg.jpeg", "RC Strasbourg Alsace": "strasbourg.jpeg",
  "Monaco": "monaco.jpeg", "AS Monaco": "monaco.jpeg",
  "Marseille": "marseille.jpeg", "Olympique Marseille": "marseille.jpeg", "Olympique de Marseille": "marseille.jpeg",
  "Toulouse": "toulouse.jpeg", "Toulouse FC": "toulouse.jpeg",
  "Lorient": "lorient.jpeg", "FC Lorient": "lorient.jpeg",
  "Brest": "brest.jpeg", "Stade Brest": "brest.jpeg", "Stade Brestois 29": "brest.jpeg",
  // ── Eredivisie (Netherlands) ──
  "Ajax": "ajax.jpeg", "AFC Ajax": "ajax.jpeg", "Ajax Amsterdam": "ajax.jpeg",
  "PSV": "psv.jpeg", "PSV Eindhoven": "psv.jpeg",
  "Feyenoord": "feyenoord.jpeg", "Feyenoord Rotterdam": "feyenoord.jpeg",
  "FC Utrecht": "utrecht.jpeg", "Utrecht": "utrecht.jpeg",
  "FC Twente": "twente.jpeg", "Twente": "twente.jpeg",
  "AZ": "az.jpeg", "AZ Alkmaar": "az.jpeg",
  "NEC Nijmegen": "nec.jpeg", "NEC": "nec.jpeg",
  "SC Heerenveen": "heerenveen.jpeg", "Heerenveen": "heerenveen.jpeg",
  "Go Ahead Eagles": "go-ahead-eagles.jpeg",
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
  // ── Spain ──
  "La Liga": "🇪🇸", "LaLiga": "🇪🇸", "LaLiga2": "🇪🇸", "LaLiga Hypermotion": "🇪🇸",
  "Segunda": "🇪🇸", "Segunda División": "🇪🇸", "Copa del Rey": "🇪🇸", "Supercopa de España": "🇪🇸",
  // ── England ──
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "EFL Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "League One": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "League Two": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "FA Cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "EFL Cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Carabao Cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  // ── UEFA ──
  "Champions League": "⭐", "UEFA Champions League": "⭐", "UCL": "⭐",
  "Europa League": "🌟", "UEFA Europa League": "🌟", "UEL": "🌟",
  "Conference League": "🟢", "UEFA Conference League": "🟢",
  // ── Italy ──
  "Serie A": "🇮🇹", "Serie B": "🇮🇹", "Serie C": "🇮🇹", "Coppa Italia": "🇮🇹",
  // ── Germany ──
  "Bundesliga": "🇩🇪", "2. Bundesliga": "🇩🇪", "3. Liga": "🇩🇪", "DFB-Pokal": "🇩🇪",
  // ── France ──
  "Ligue 1": "🇫🇷", "Ligue 2": "🇫🇷", "Coupe de France": "🇫🇷",
  // ── Portugal ──
  "Liga Portugal": "🇵🇹", "Primeira Liga": "🇵🇹", "Liga NOS": "🇵🇹",
  "Segunda Liga": "🇵🇹", "Liga Portugal 2": "🇵🇹", "Taça de Portugal": "🇵🇹", "Taça da Liga": "🇵🇹",
  // ── Netherlands ──
  "Eredivisie": "🇳🇱", "Eerste Divisie": "🇳🇱", "KNVB Cup": "🇳🇱",
  // ── Belgium ──
  "Belgian Pro League": "🇧🇪", "Jupiler Pro League": "🇧🇪", "First Division A": "🇧🇪",
  // ── Turkey ──
  "Süper Lig": "🇹🇷", "Super Lig": "🇹🇷", "TFF First League": "🇹🇷", "TFF Second League": "🇹🇷",
  // ── Scotland ──
  "Scottish Premiership": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Scottish Championship": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Scottish League Cup": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  // ── Switzerland ──
  "Swiss Super League": "🇨🇭", "Swiss Challenge League": "🇨🇭",
  // ── Denmark ──
  "Danish Superliga": "🇩🇰", "1. Division": "🇩🇰",
  // ── Sweden ──
  "Allsvenskan": "🇸🇪", "Superettan": "🇸🇪",
  // ── Norway ──
  "Eliteserien": "🇳🇴",
  // ── Finland ──
  "Veikkausliiga": "🇫🇮",
  // ── Croatia ──
  "HNL": "🇭🇷", "Prva HNL": "🇭🇷",
  // ── Serbia ──
  "Serbian SuperLiga": "🇷🇸", "SuperLiga": "🇷🇸",
  // ── Czech Republic ──
  "Czech Liga": "🇨🇿", "Czech First League": "🇨🇿", "Fortuna Liga": "🇨🇿",
  // ── Poland ──
  "Ekstraklasa": "🇵🇱",
  // ── Greece ──
  "Super League": "🇬🇷", "Super League 1": "🇬🇷",
  // ── Austria ──
  "Austrian Bundesliga": "🇦🇹", "Bundesliga Austria": "🇦🇹",
  // ── Russia ──
  "Russian Premier League": "🇷🇺", "RPL": "🇷🇺",
  // ── Ukraine ──
  "Ukrainian Premier League": "🇺🇦",
  // ── Romania ──
  "Liga 1": "🇷🇴",
  // ── Hungary ──
  "OTP Bank Liga": "🇭🇺",
  // ── Slovakia ──
  "Fortuna Liga Slovakia": "🇸🇰",
  // ── Israel ──
  "Israeli Premier League": "🇮🇱", "Ligat ha'Al": "🇮🇱",
  // ── Brazil ──
  "Brasileirao": "🇧🇷", "Brasileirão": "🇧🇷", "Campeonato Brasileiro": "🇧🇷",
  "Copa do Brasil": "🇧🇷", "Série B": "🇧🇷", "Série A": "🇧🇷",
  "Campeonato Paulista": "🇧🇷", "Campeonato Carioca": "🇧🇷", "Campeonato Gaúcho": "🇧🇷",
  // ── Argentina ──
  "Primera División": "🇦🇷", "Primera Division": "🇦🇷", "Liga Profesional": "🇦🇷",
  "Copa de la Liga": "🇦🇷", "Torneo Apertura": "🇦🇷", "Torneo Clausura": "🇦🇷",
  // ── Mexico ──
  "Liga MX": "🇲🇽", "Apertura": "🇲🇽", "Clausura": "🇲🇽", "Liga de Expansión MX": "🇲🇽",
  // ── Colombia ──
  "Liga BetPlay": "🇨🇴", "Primera A": "🇨🇴",
  // ── Chile ──
  "Primera División Chile": "🇨🇱",
  // ── Uruguay ──
  "Primera División Uruguay": "🇺🇾",
  // ── Peru ──
  "Liga 1 Peru": "🇵🇪", "Primera División Perú": "🇵🇪",
  // ── Ecuador ──
  "LigaPro": "🇪🇨",
  // ── Paraguay ──
  "División de Honor": "🇵🇾",
  // ── Bolivia ──
  "División Profesional": "🇧🇴",
  // ── Venezuela ──
  "Primera División Venezuela": "🇻🇪",
  // ── USA / Canada ──
  "MLS": "🇺🇸", "USL Championship": "🇺🇸",
  "NBA": "🇺🇸", "NHL": "🇺🇸", "MLB": "⚾", "USA: MLB": "⚾", "NFL": "🇺🇸",
  "NHL — Playoffs": "🏒", "NBA Playoffs": "🇺🇸",
  // ── South Korea ──
  "K League 1": "🇰🇷", "K League 2": "🇰🇷",
  // ── Japan ──
  "J1 League": "🇯🇵", "J2 League": "🇯🇵",
  // ── China ──
  "Chinese Super League": "🇨🇳", "CSL": "🇨🇳",
  // ── Australia ──
  "A-League Men": "🇦🇺", "A-League": "🇦🇺",
  // ── Saudi Arabia ──
  "Saudi Pro League": "🇸🇦", "Saudi Professional League": "🇸🇦",
  // ── Qatar ──
  "Qatar Stars League": "🇶🇦",
  // ── UAE ──
  "UAE Pro League": "🇦🇪",
  // ── Tennis ──
  "ATP 1000": "🎾", "ATP 500": "🎾", "ATP 250": "🎾",
  "WTA 1000": "🎾", "WTA 500": "🎾", "WTA 250": "🎾",
  "Roland Garros": "🇫🇷", "Wimbledon": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "US Open": "🇺🇸", "Australian Open": "🇦🇺",
  "Davis Cup": "🎾", "ATP Finals": "🎾",
  // ── Volleyball ──
  "Volleyball Nations League": "🏐", "Superlega — Itália": "🏐",
  "CEV Champions League": "🏐", "Superliga Brasileira": "🏐",
  // ── Basketball ──
  "EuroLeague": "⭐", "EuroCup": "🏀",
  "ACB": "🇪🇸", "Betclic Elite": "🇫🇷", "Basketball Bundesliga": "🇩🇪",
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
