// Cross-provider team-name matching for PulseScore ↔ our own tracked
// matches (Statpal/SportsAPI V2 team names). Deliberately a standalone
// copy of the same tolerant-match approach already proven in
// routes/matches.ts (namesMatch(), used there for Statpal ↔ SportScore
// matching) rather than an import from matches.ts — importing from there
// would create a circular dependency (matches.ts imports this service),
// and this keeps the blast radius of a PulseScore-specific tweak away
// from the core matches.ts matching logic used for the live tracker.
//
// The >=0.82 fuzzy floor is the same value already battle-tested there
// (verified to separate real near-misses like "Deportivo Cali" vs
// "Deportivo Pasto" from genuine spelling/abbreviation variants).

// BetBY's individual-player sports (tennis, table-tennis, etc.) name
// players "Lastname, Firstname" — e.g. "Ruse, Elena-Gabriela" — while every
// other provider used here (Statpal/SportsAPI) shows "Firstname Lastname".
// A literal comma essentially never appears in a real team/club name, so
// it's an unambiguous signal to reorder before comparing rather than a
// generic normalization that could misfire on club names.
function reorderSurnameFirst(name: string): string {
  const idx = name.indexOf(",");
  if (idx < 0) return name;
  const last = name.slice(0, idx).trim();
  const first = name.slice(idx + 1).trim();
  return first && last ? `${first} ${last}` : name;
}

function slugifyTeamName(name: string): string {
  return reorderSurnameFirst(name)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ca/fk/sk/cs/uc/ss/gks/kv added 2026-08-09 — confirmed real (side-by-side
// PulseScore/bwin vs API-Football live-feed comparison, same day): "CA
// Atlanta" vs "Atlanta", "SS Arezzo" vs "Arezzo", "FK Borac Banja Luka" vs
// "Borac Banja Luka", "UC Sampdoria" vs "Sampdoria", "CS Dock Sud" vs "Dock
// Sud", "SK Sigma Olomouc" vs "Sigma Olomouc", "GKS Tychy" vs "Tychy 71" —
// bwin keeps the club-type prefix (Club Atlético, Fudbalski Klub, Sportovní
// klub, Club Sportivo, Unione Calcio, Società Sportiva, Górniczy Klub
// Sportowy, Koninklijke Voetbalclub), API-Football's own name usually drops
// it. None of these overlapped with the original list (which only covered
// Western European abbreviations).
//
// BR-specific club-type prefixes/suffixes added 2026-08-12 after a real
// PulseScore/bwin vs API-Football comparison of ~40 Brazilian live fixtures
// confirmed these are dropped by API-Football but carried by bwin:
//   SE  (Sociedade Esportiva)            — SE Palmeiras vs Palmeiras
//   CR  (Clube de Regatas)               — CR Flamengo vs Flamengo
//   AA  (Associação Atlética)            — AA Internacional vs Internacional
//   AD  (Associação Desportiva)          — AD São Paulo vs São Paulo
//   CE  (Clube Esportivo)                — CE Ceará vs Ceará
//   EC  (Esporte Clube)                  — EC Bahia vs Bahia
//   SC  (already present; Sociedade/ Sport Club)
//   CAC / CAX / independente spelling variants not prefixable, so not
//   added here — those rely on the fuzzy+league fallback below instead.
// Also added the standalone phrases "Clube Atlético", "Sociedade Esportiva",
// "Esporte Clube", "Associação Atlética", "Clube de Regatas" as whole-word
// tokens, since bwin sometimes uses the expanded form instead of the
// abbreviation for lower-division clubs.
const CLUB_TOKEN_RE =
  /\b(fc|cf|ud|sc|ac|cd|afc|sad|se|cr|aa|ad|ce|ec|club|clube|futebol clube|esporte clube|clube atlético|clube atletico|sociedade esportiva|associação atlética|associacao atletica|clube de regatas|associação desportiva|associacao desportiva|f\.c\.|ca|fk|sk|cs|uc|ss|gks|kv|dr|dr\.|club\s+dr|club\s+doctor)\b/gi;
function slugifyTeamNameStripped(name: string): string {
  const stripped = name.replace(CLUB_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
  return slugifyTeamName(stripped || name);
}

function slugifyTeamNameSorted(name: string): string {
  return slugifyTeamNameStripped(name).split("-").filter(Boolean).sort().join("-");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}
function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

export function teamNamesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (slugifyTeamName(a) === slugifyTeamName(b)) return true;
  if (slugifyTeamNameStripped(a) === slugifyTeamNameStripped(b)) return true;
  if (slugifyTeamNameSorted(a) === slugifyTeamNameSorted(b)) return true;
  if (nameSimilarity(slugifyTeamNameStripped(a), slugifyTeamNameStripped(b)) >= 0.82) return true;

  // Surname-only fallback — only when at least one side is confirmed to be
  // a "Lastname, Firstname" individual-player name (comma present), since
  // comparing just the last token would be dangerous for club names (e.g.
  // "Real Madrid" vs "Atletico Madrid" both end in "madrid"). Handles a
  // provider abbreviating/dropping the given name (e.g. BetBY's full
  // "Ruse, Elena-Gabriela" vs another provider's "E. Ruse" or just "Ruse"),
  // which the general fuzzy-similarity check above can fail on when the
  // given name makes up a large share of the string length.
  if (a.includes(",") || b.includes(",")) {
    const surnameOf = (name: string): string => {
      const tokens = slugifyTeamName(name).split("-").filter(Boolean);
      return tokens[tokens.length - 1] ?? "";
    };
    const sa = surnameOf(a);
    const sb = surnameOf(b);
    if (sa && sb && sa === sb) return true;
  }

  // Initial+surname fallback — bwin's tennis market selections often
  // abbreviate the given name to a single or double initial ("J.
  // Schwaerzler", "O.J. Gutierrez") while the tracked event's own home/away
  // field carries the full given name plus a trailing "(CTRY)" suffix
  // ("Joel Schwaerzler (AUT)", "Oscar Jose Gutierrez (ESP)") — confirmed
  // against real /tennis/leagues and /tennis/events samples (2026-08-09).
  // The fuzzy-similarity check above fails this pair outright (the given
  // name is too large a share of the full string for the abbreviation to
  // score high), and it isn't comma-formatted so the fallback above doesn't
  // fire either. Gated on one side actually LOOKING like an initial
  // abbreviation (single/double letter token ending in a period, not just
  // any name that happens to start with the same letter) to keep this the
  // same shape as the comma-gated fallback above — an unrelated full name
  // never reaches the surname/initial comparison at all.
  const stripTrailingCountrySuffix = (name: string): string =>
    name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const looksInitialAbbreviated = (name: string): boolean =>
    /^([A-Za-z]\.){1,2}$/.test(name.trim().split(/\s+/)[0] ?? "");
  const initialSurnameMatch = (x: string, y: string): boolean => {
    const tokensOf = (name: string): string[] =>
      slugifyTeamNameStripped(stripTrailingCountrySuffix(name)).split("-").filter(Boolean);
    const tokensX = tokensOf(x);
    const tokensY = tokensOf(y);
    const surnameX = tokensX[tokensX.length - 1];
    const surnameY = tokensY[tokensY.length - 1];
    const initialX = tokensX[0]?.[0];
    const initialY = tokensY[0]?.[0];
    return !!(surnameX && surnameY && surnameX === surnameY && initialX && initialY && initialX === initialY);
  };

  // Doubles pairs ("J. Anderson/M. Jones") — applying initialSurnameMatch to
  // the whole "/"-joined string only ever compared the FIRST player's
  // initial against the LAST player's surname, silently ignoring the other
  // half of the pair entirely. Confirmed exploitable via audit (2026-08-10):
  // teamNamesMatch("J. Anderson/M. Jones", "J. Smith/M. Jones") returned
  // true — a real risk since bwin abbreviates doubles selections exactly
  // this way. Only takes over when BOTH sides are genuinely "/"-joined
  // 2-player pairs; falls through to the single-player checks below
  // otherwise (e.g. one side missing entirely, or a team name that
  // coincidentally contains a "/"). Checked in both pairings since
  // providers don't guarantee the same player order.
  const slashPartsOf = (name: string): string[] =>
    name.split("/").map((p) => p.trim()).filter(Boolean);
  const partsA = slashPartsOf(a);
  const partsB = slashPartsOf(b);
  if (partsA.length === 2 && partsB.length === 2) {
    const straightMatch = initialSurnameMatch(partsA[0]!, partsB[0]!) && initialSurnameMatch(partsA[1]!, partsB[1]!);
    const crossMatch = initialSurnameMatch(partsA[0]!, partsB[1]!) && initialSurnameMatch(partsA[1]!, partsB[0]!);
    if (straightMatch || crossMatch) return true;
  } else if (looksInitialAbbreviated(a) || looksInitialAbbreviated(b)) {
    if (initialSurnameMatch(a, b)) return true;
  }

  // Team-nickname suffix fallback — bwin's hockey market selections often
  // give just the mascot/nickname ("Panthers") while the tracked event's own
  // home/away field carries the full "City Mascot" name ("Florida
  // Panthers") — confirmed against a real /ice-hockey/leagues sample
  // (2026-08-09, NHL's "3-Way - Result After Regular Time" market). The
  // fuzzy-similarity check above fails this pair outright when the city
  // name is a large share of the full string ("florida-panthers" vs
  // "panthers" scores well under 0.82). Matches only when the shorter name's
  // full token sequence is an exact trailing match of the longer name's
  // tokens — not a generic substring check — so "Rangers" only matches a
  // full name actually ending in "...Rangers", not an unrelated team whose
  // name happens to contain that word elsewhere.
  // "jong" (Dutch "young", e.g. "Jong Ajax", "Jong PSV") added 2026-08-10 —
  // it's a LEADING marker, so it only ever mattered for the trailing
  // fallback below (a reserve side named "Jong X" hits that branch, not
  // the leading one, since the shared tokens are trailing "...x").
  const reserveSideMarker =
    /\b(ii|iii|b|ib|reserve|reserves|reservas|castilla|academy|academia|youth|juvenil|junior|juniors|jong|sub-?1[5-9]|sub-?2[0-3]|u1[5-9]|u2[0-3])\b/i;

  const tokensA2 = slugifyTeamNameStripped(a).split("-").filter(Boolean);
  const tokensB2 = slugifyTeamNameStripped(b).split("-").filter(Boolean);
  if (tokensA2.length > 0 && tokensB2.length > 0 && tokensA2.length !== tokensB2.length) {
    const [shorter, longer] = tokensA2.length < tokensB2.length ? [tokensA2, tokensB2] : [tokensB2, tokensA2];
    const tail = longer.slice(longer.length - shorter.length);
    if (tail.join("-") === shorter.join("-")) {
      // Same reserve/youth-side guard as the leading-token fallback below —
      // this trailing fallback had none at all (confirmed via audit,
      // 2026-08-10: teamNamesMatch("Ajax", "Jong Ajax") returned true, a
      // real collision since "Jong Ajax" reaches THIS branch, not the
      // leading one the old comment assumed — "Jong" is a leading word on
      // the LONGER name, but matching happens on the trailing tokens
      // ("ajax" = "ajax"), so the leading-only guard never saw it). Any
      // words the longer name has BEFORE the shared trailing tokens are
      // the extra part here (unlike the leading-fallback below, where the
      // extra words come AFTER).
      const extra = longer.slice(0, longer.length - shorter.length).join(" ");
      if (reserveSideMarker.test(extra)) return false;
      return true;
    }

    // Leading-token fallback — the mirror image of the trailing/nickname
    // one just above, added 2026-08-09 after a real PulseScore/bwin vs
    // API-Football live-feed comparison turned up the OPPOSITE truncation
    // direction repeatedly: API-Football drops a trailing city/qualifier
    // word bwin keeps, e.g. "FK Vojvodina Novi Sad" vs "Vojvodina" (Novi
    // Sad dropped), "SK Artis Brno" vs "Artis" (Brno dropped), "CA San
    // Lorenzo de Almagro" vs "San Lorenzo" (de Almagro dropped) — the
    // fuzzy-similarity check above fails these outright for the same
    // reason the trailing-fallback's own comment explains (the dropped
    // words are too large a share of the longer string).
    //
    // Guarded against the one real danger a leading-match introduces that
    // a trailing-match doesn't: a reserve/youth side sharing its parent
    // club's full name as a PREFIX ("Real Madrid" vs "Real Madrid
    // Castilla", "Barcelona" vs "Barcelona B"). If the words the longer
    // name adds beyond the shorter one look like a reserve/youth-team
    // marker, do NOT match — those are two different, separately bettable
    // sides, not a naming variant of the same one. Shares reserveSideMarker
    // with the trailing fallback above (which needed the identical guard
    // added, audit 2026-08-10 — see its own comment for why "Jong Ajax"
    // actually reaches THAT branch, not this one).
    const head = longer.slice(0, shorter.length);
    if (head.join("-") === shorter.join("-")) {
      const extra = longer.slice(shorter.length).join(" ");
      if (!reserveSideMarker.test(extra)) return true;
    }
  }

  return false;
}
