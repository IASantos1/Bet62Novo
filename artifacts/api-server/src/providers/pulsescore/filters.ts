// PulseScore's /onexbet/ feed mixes real fixtures with 1xBet's own virtual
// football product — confirmed real 2026-09-10: the first page of
// /soccer/events came back with 5 "MLS+" fixtures (Chivas +, Detroit +,
// Las Vegas +, ...) ALL sharing the exact same kickoff timestamp
// (2026-09-10T06:00:00.000Z) with sequential event ids and team names
// that don't correspond to any real club — the textbook signature of a
// simulated football round, not real matches. Left unfiltered, the
// matching engine could pair a virtual fixture against an unrelated real
// GOAL API fixture by name coincidence, or waste work trying to match
// something that will never appear on the real-sports side at all.
//
// This codebase already has one bad experience with a league-name
// virtual/fake-match theory (see routes/matches.ts's "REVERTED
// 2026-08-18" comment on a filter that turned out to be hiding real
// Champions League/Libertadores matches) — so this stays narrow and
// evidence-based rather than pattern-matching on vibes. Specifically NOT
// blocked: "Regional League. W" (also seen in the captured PulseScore
// live-events payload) — no confirmed virtual signature, and "W" may
// just be an abbreviation for a real women's league the existing
// isWomensLeague regex (routes/matches.ts) doesn't happen to catch. One
// ambiguous example isn't enough evidence to classify it either way.
export function isVirtualPulseScoreLeague(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  // Same virtual/esoccer keywords already validated for GOAL API's feed
  // (routes/matches.ts's isVirtualFootballLeague) — these are standard
  // cross-provider branding for simulated football, not provider-specific.
  if (
    lower.includes("esoccer") ||
    lower.includes("e-soccer") ||
    lower.includes("cyber football") ||
    lower.includes("virtual football") ||
    lower.includes("fifa virtual") ||
    /\bmins?\s*play\b/.test(lower)
  ) {
    return true;
  }
  // 1xBet's own virtual-league naming convention: a "+" suffix directly
  // after a letter (e.g. "MLS+", "England+", "Germany+" are documented
  // 1xBet virtual league names). Deliberately requires a LETTER right
  // before the "+", not a digit — "AFIA World Cup 55+" is a real league
  // (an age-group qualifier, players 55+), confirmed present in the same
  // captured payload, and must NOT be caught by this.
  if (/[a-z]\+\s*$/i.test(n)) return true;
  return false;
}
