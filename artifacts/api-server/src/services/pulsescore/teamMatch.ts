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

function slugifyTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CLUB_TOKEN_RE = /\b(fc|cf|ud|sc|ac|cd|afc|sad|club|clube|futebol clube|esporte clube|f\.c\.)\b/gi;
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
  return nameSimilarity(slugifyTeamNameStripped(a), slugifyTeamNameStripped(b)) >= 0.82;
}
