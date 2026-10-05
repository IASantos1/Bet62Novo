// Flag emoji for national-team fixtures (Nations League etc.) — never for
// club teams, which we have no logo/flag source for from WinHouse's data.
// Country flags are plain reference data (not a judgment call like the
// league-tier list), so this map can be broad, but matching stays strict:
// only an EXACT match (after normalization) against a known country name
// returns a flag; anything else — including every club name — returns
// null. A club happening to contain a country-like word must never show a
// wrong flag, so there is no partial/substring matching here.
//
// Real data confirmed (2026-10-05): WinHouse sends team names in English
// for some entries and Portuguese for others, inconsistently (the same
// bug documented in listGame.ts for other fields) — so each country has
// both spellings listed as keys.

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTRY_FLAGS: Record<string, string> = {
  // Europe (UEFA Nations League participants + already-curated league countries)
  "albania": "🇦🇱", "albânia": "🇦🇱",
  "andorra": "🇦🇩",
  "armenia": "🇦🇲", "arménia": "🇦🇲", "armênia": "🇦🇲",
  "austria": "🇦🇹", "áustria": "🇦🇹",
  "azerbaijan": "🇦🇿", "azerbaijão": "🇦🇿",
  "belarus": "🇧🇾", "bielorrússia": "🇧🇾",
  "belgium": "🇧🇪", "bélgica": "🇧🇪",
  "bosnia and herzegovina": "🇧🇦", "bósnia e herzegovina": "🇧🇦", "bosnia-herzegovina": "🇧🇦",
  "bulgaria": "🇧🇬", "bulgária": "🇧🇬",
  "croatia": "🇭🇷", "croácia": "🇭🇷",
  "cyprus": "🇨🇾", "chipre": "🇨🇾",
  "czech republic": "🇨🇿", "chequia": "🇨🇿", "república checa": "🇨🇿",
  "denmark": "🇩🇰", "dinamarca": "🇩🇰",
  "england": "🏴", "inglaterra": "🏴",
  "estonia": "🇪🇪", "estónia": "🇪🇪", "estônia": "🇪🇪",
  "faroe islands": "🇫🇴", "ilhas faroe": "🇫🇴",
  "finland": "🇫🇮", "finlândia": "🇫🇮",
  "france": "🇫🇷", "frança": "🇫🇷",
  "georgia": "🇬🇪", "geórgia": "🇬🇪",
  "germany": "🇩🇪", "alemanha": "🇩🇪",
  "gibraltar": "🇬🇮",
  "greece": "🇬🇷", "grécia": "🇬🇷",
  "hungary": "🇭🇺", "hungria": "🇭🇺",
  "iceland": "🇮🇸", "islândia": "🇮🇸",
  "ireland": "🇮🇪", "irlanda": "🇮🇪",
  "israel": "🇮🇱",
  "italy": "🇮🇹", "itália": "🇮🇹",
  "kazakhstan": "🇰🇿", "cazaquistão": "🇰🇿",
  "kosovo": "🇽🇰",
  "latvia": "🇱🇻", "letónia": "🇱🇻", "letônia": "🇱🇻",
  "liechtenstein": "🇱🇮",
  "lithuania": "🇱🇹", "lituânia": "🇱🇹",
  "luxembourg": "🇱🇺", "luxemburgo": "🇱🇺",
  "malta": "🇲🇹",
  "moldova": "🇲🇩",
  "monaco": "🇲🇨", "mónaco": "🇲🇨", "mônaco": "🇲🇨",
  "montenegro": "🇲🇪",
  "netherlands": "🇳🇱", "holanda": "🇳🇱", "países baixos": "🇳🇱",
  "north macedonia": "🇲🇰", "macedónia do norte": "🇲🇰", "macedônia do norte": "🇲🇰",
  "northern ireland": "🇬🇧", "irlanda do norte": "🇬🇧",
  "norway": "🇳🇴", "noruega": "🇳🇴",
  "poland": "🇵🇱", "polónia": "🇵🇱", "polônia": "🇵🇱",
  "portugal": "🇵🇹",
  "romania": "🇷🇴", "roménia": "🇷🇴", "romênia": "🇷🇴",
  "russia": "🇷🇺", "rússia": "🇷🇺",
  "san marino": "🇸🇲",
  "scotland": "🏴", "escócia": "🏴",
  "serbia": "🇷🇸", "sérvia": "🇷🇸",
  "slovakia": "🇸🇰", "eslováquia": "🇸🇰",
  "slovenia": "🇸🇮", "eslovénia": "🇸🇮", "eslovênia": "🇸🇮",
  "spain": "🇪🇸", "espanha": "🇪🇸",
  "sweden": "🇸🇪", "suécia": "🇸🇪",
  "switzerland": "🇨🇭", "suíça": "🇨🇭",
  "turkey": "🇹🇷", "turquia": "🇹🇷",
  "ukraine": "🇺🇦", "ucrânia": "🇺🇦",
  "wales": "🏴", "gales": "🏴",
  // CONCACAF / Americas
  "antigua and barbuda": "🇦🇬", "antígua e barbuda": "🇦🇬",
  "argentina": "🇦🇷",
  "aruba": "🇦🇼",
  "bahamas": "🇧🇸",
  "barbados": "🇧🇧",
  "belize": "🇧🇿",
  "bermuda": "🇧🇲", "bermudas": "🇧🇲",
  "bolivia": "🇧🇴", "bolívia": "🇧🇴",
  "bonaire": "🇧🇶",
  "brazil": "🇧🇷", "brasil": "🇧🇷",
  "canada": "🇨🇦", "canadá": "🇨🇦",
  "cayman islands": "🇰🇾", "ilhas caimão": "🇰🇾",
  "chile": "🇨🇱",
  "colombia": "🇨🇴", "colômbia": "🇨🇴",
  "costa rica": "🇨🇷",
  "cuba": "🇨🇺",
  "curacao": "🇨🇼", "curaçao": "🇨🇼",
  "dominica": "🇩🇲",
  "dominican republic": "🇩🇴", "república dominicana": "🇩🇴",
  "ecuador": "🇪🇨", "equador": "🇪🇨",
  "el salvador": "🇸🇻",
  "french guiana": "🇬🇫", "guiana francesa": "🇬🇫",
  "grenada": "🇬🇩",
  "guadeloupe": "🇬🇵", "guadalupe": "🇬🇵",
  "guatemala": "🇬🇹",
  "guyana": "🇬🇾",
  "haiti": "🇭🇹",
  "honduras": "🇭🇳",
  "jamaica": "🇯🇲",
  "martinique": "🇲🇶", "martinica": "🇲🇶",
  "mexico": "🇲🇽", "méxico": "🇲🇽",
  "nicaragua": "🇳🇮", "nicarágua": "🇳🇮",
  "panama": "🇵🇦", "panamá": "🇵🇦",
  "paraguay": "🇵🇾", "paraguai": "🇵🇾",
  "peru": "🇵🇪",
  "puerto rico": "🇵🇷",
  "saint kitts and nevis": "🇰🇳", "são cristóvão e névis": "🇰🇳",
  "saint lucia": "🇱🇨", "santa lúcia": "🇱🇨",
  "saint vincent and the grenadines": "🇻🇨", "são vicente e granadinas": "🇻🇨",
  "suriname": "🇸🇷",
  "trinidad and tobago": "🇹🇹", "trindade e tobago": "🇹🇹",
  "turks and caicos islands": "🇹🇨", "ilhas turcas e caicos": "🇹🇨",
  "united states": "🇺🇸", "estados unidos": "🇺🇸",
  "uruguay": "🇺🇾", "uruguai": "🇺🇾",
  "venezuela": "🇻🇪",
  // Other confederations seen in allowed leagues / sample data
  "japan": "🇯🇵", "japão": "🇯🇵",
  "saudi arabia": "🇸🇦", "arábia saudita": "🇸🇦",
};

// Only ever returns a flag for an EXACT (post-normalization) country-name
// match — never for a club name, even one that looks country-related.
export function getCountryFlag(teamName: string): string | null {
  const key = stripDiacritics(teamName);
  return COUNTRY_FLAGS[key] ?? null;
}
