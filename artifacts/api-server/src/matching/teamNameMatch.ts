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
// universally generic club-type words/abbreviations (FC, CF, AFC, SC,
// AC, CLUB, and the FK/PFK — "Football Klub"/"Professional Football
// Klub" — prefix common across Eastern Europe/Central Asia) — nothing
// that could plausibly be part of a real distinguishing name (e.g.
// "United", "Atlético", "City" are NOT stripped). Confirmed real via
// production near-misses 2026-09-10: "Ibri" vs "Ibri Club", "PFK
// Andijon" vs "Andijan" both failed to match before CLUB/FK/PFK were
// added here.
const DIACRITIC_MARKS_RE = /[\u0300-\u036f]/g;
const CLUB_SUFFIX_TOKENS = new Set(["fc", "cf", "afc", "sc", "ac", "club", "fk", "pfk"]);
/** Letters that don't decompose under NFD (so DIACRITIC_MARKS_RE never
 * touches them) but are still a plain-letter variant one provider uses
 * while the other transliterates to closer-to-ASCII — confirmed real:
 * Azerbaijani "ə" (schwa) in "Səbail" vs "Sabail". Extend only on
 * confirmed real mismatches, not preemptively — this isn't a general
 * transliteration table. */
const NON_DECOMPOSING_LETTER_MAP: Record<string, string> = { "ə": "a" };

export function normalizeTeamName(value: string | null | undefined): string {
  let raw = String(value ?? "").toLowerCase();
  for (const [from, to] of Object.entries(NON_DECOMPOSING_LETTER_MAP)) {
    raw = raw.split(from).join(to);
  }
  const base = raw
    .trim()
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

/** Overlap coefficient (intersection / smaller set's size) rather than
 * Jaccard's intersection/union — deliberately more forgiving when one
 * provider's name is a strict superset of the other's tokens (a city or
 * qualifier one side adds and the other omits, e.g. "Al Jazira" vs "Al
 * Jazira Abu Dhabi", or "Qizilqum" vs "Qizilqum Zarafshon"). Jaccard
 * alone punishes this correctly-matching case hard since the extra
 * tokens inflate the union; confirmed real via production near-misses
 * 2026-09-10 where several genuine pairs sat right at/under NAME_FLOOR
 * purely because of an added qualifier word on one side. */
function tokenContainment(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  const minSize = Math.min(setA.size, setB.size);
  if (minSize === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / minSize;
}

/** 0-1 similarity between two raw name strings from any two providers.
 * Combines token overlap (robust to word reordering / extra qualifier
 * words), token containment (robust to one side adding a qualifier word
 * the other omits entirely), and a Levenshtein ratio (robust to
 * abbreviations and minor spelling differences), taking the best of the
 * three — any one kind of divergence alone shouldn't sink an otherwise-
 * strong match. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(tokenJaccard(na, nb), tokenContainment(na, nb), levenshteinRatio(na, nb));
}
