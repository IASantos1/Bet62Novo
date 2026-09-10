// Generic, provider-agnostic name similarity — no PulseScore/GOAL API
// specifics here on purpose, so either provider's raw team/league name
// string can go through the same normalization. Extends the diacritic/
// case/whitespace handling already validated in this codebase
// (liveCompetitionCatalog.ts's normalizeCatalogValue) with club-suffix
// stripping and a similarity score, since matching needs "close enough",
// not "identical after normalization" — two providers will format the
// same real club differently (confirmed pattern in this codebase's own
// history: providerCompetitions.ts's mappingConfidence exists precisely
// because provider-vs-canonical names never line up exactly).
//
// Deliberately conservative on what counts as noise to strip: only
// universally generic club-suffix abbreviations (FC, CF, AFC, SC, AC) —
// nothing that could plausibly be part of a real distinguishing name
// (e.g. "United", "Atlético", "City" are NOT stripped).
const DIACRITIC_MARKS_RE = /[\u0300-\u036f]/g;
const CLUB_SUFFIX_TOKENS = new Set(["fc", "cf", "afc", "sc", "ac"]);

export function normalizeTeamName(value: string | null | undefined): string {
  const base = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIC_MARKS_RE, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = base.split(" ").filter((t) => t && !CLUB_SUFFIX_TOKENS.has(t));
  return tokens.join(" ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 0-1 similarity between two raw name strings from any two providers.
 * Combines token overlap (robust to word reordering / extra qualifier
 * words) with a Levenshtein ratio (robust to abbreviations and minor
 * spelling differences) and takes the better of the two, since either
 * kind of divergence alone shouldn't sink an otherwise-strong match. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(tokenJaccard(na, nb), levenshteinRatio(na, nb));
}
