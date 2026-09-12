// BET62 Fase 0 (hybrid GOAL API + PulseScore architecture, 2026-09-10) —
// background sync of canonical_matches / match_provider_mapping, mirroring
// liveCompetitionCatalog.ts's syncLiveCompetitionCatalog throttle/in-flight
// pattern exactly (same interval, same fire-and-forget shape), one level
// down (matches instead of whole competitions).
//
// Lookup key is deliberately the PROVIDER MAPPING (provider + providerSport
// + providerMatchId), never team names on the canonical table itself — two
// teams play many distinct matches across a season, so a canonical row
// keyed by (sport, home, away) would silently merge different matches
// between the same two teams into one row. A new provider mapping row
// always means either "first time seeing this provider match id" (insert
// a new canonical match) or "seen before" (touch lastSeenAt on the
// existing one) — never a team-name-based conflict resolution.
//
// GOAL API is the only provider writing here today (confidence 100 — a
// single source has nothing to disambiguate against). Small known race:
// two near-simultaneous first-sightings of the same new fixture could each
// insert a canonical_matches row before either's mapping insert lands;
// the mapping table's unique index prevents a duplicate MAPPING row, but
// not a duplicate orphaned canonical row. Acceptable for this phase (low
// write frequency via the throttle below, not yet a source of truth for
// anything) — revisit if/when a second provider needs real matching.
import { db, matchesTable, matchProviderMappingTable } from "../../../../lib/db/src/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { normalizeCatalogValue } from "./liveCompetitionCatalog.js";

export type SeenMatchInput = {
  sport: string;
  provider: string;
  providerMatchId: string;
  home: string;
  away: string;
  leagueName?: string | null;
  competitionId?: number | null;
  kickoffUtc?: Date | null;
  status?: string | null;
};

export async function ensureCanonicalMatch(input: SeenMatchInput): Promise<number | null> {
  const sport = normalizeCatalogValue(input.sport);
  const provider = String(input.provider ?? "").trim();
  const providerMatchId = String(input.providerMatchId ?? "").trim();
  const home = String(input.home ?? "").trim();
  const away = String(input.away ?? "").trim();
  if (!sport || !provider || !providerMatchId || !home || !away) return null;

  const [existingMapping] = await db
    .select({ matchId: matchProviderMappingTable.matchId })
    .from(matchProviderMappingTable)
    .where(
      and(
        eq(matchProviderMappingTable.provider, provider),
        eq(matchProviderMappingTable.providerSport, sport),
        eq(matchProviderMappingTable.providerMatchId, providerMatchId),
      ),
    )
    .limit(1);

  if (existingMapping) {
    await db
      .update(matchProviderMappingTable)
      .set({ homeNameRaw: home, awayNameRaw: away, lastSeenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(matchProviderMappingTable.provider, provider),
          eq(matchProviderMappingTable.providerSport, sport),
          eq(matchProviderMappingTable.providerMatchId, providerMatchId),
        ),
      );
    if (input.status) {
      await db
        .update(matchesTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(matchesTable.id, existingMapping.matchId));
    }
    return existingMapping.matchId;
  }

  const [inserted] = await db
    .insert(matchesTable)
    .values({
      sport,
      homeName: home,
      awayName: away,
      normalizedHomeName: normalizeCatalogValue(home),
      normalizedAwayName: normalizeCatalogValue(away),
      competitionId: input.competitionId ?? null,
      leagueName: input.leagueName ?? null,
      kickoffUtc: input.kickoffUtc ?? null,
      status: input.status ?? "scheduled",
      updatedAt: new Date(),
    })
    .returning({ id: matchesTable.id });
  if (!inserted) return null;

  await db
    .insert(matchProviderMappingTable)
    .values({
      provider,
      providerSport: sport,
      providerMatchId,
      matchId: inserted.id,
      homeNameRaw: home,
      awayNameRaw: away,
      confidence: 100,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  return inserted.id;
}

export type UnmatchedGoalApiMatch = {
  matchId: number;
  providerMatchId: string;
  home: string;
  away: string;
  leagueName: string | null;
  kickoffUtc: Date | null;
  /** "scheduled" | "live" — lets callers distinguish a fixture that hasn't
   * kicked off yet (expected to stay unmatched against a live-only
   * candidate pool, see shadowMatchSync's fetchLivePulseScoreCandidates)
   * from one that's live right now and genuinely failed to match. */
  status: string;
};

/** Scheduled/live football canonical matches that already have a GOAL API
 * mapping (the only provider that creates canonical rows today) but no
 * mapping yet from any other provider — the exact worklist a second
 * provider's matching job needs. Two simple queries + an in-process filter
 * rather than one query with a NOT EXISTS subquery: the result set is small
 * (order of tens/hundreds of live+upcoming matches at once), so clarity
 * wins over a marginal query-count saving. */
export async function getUnmatchedGoalApiFootballMatches(
  excludeProvider: string,
): Promise<UnmatchedGoalApiMatch[]> {
  const goalApiRows = await db
    .select({
      matchId: matchesTable.id,
      providerMatchId: matchProviderMappingTable.providerMatchId,
      home: matchProviderMappingTable.homeNameRaw,
      away: matchProviderMappingTable.awayNameRaw,
      leagueName: matchesTable.leagueName,
      kickoffUtc: matchesTable.kickoffUtc,
      status: matchesTable.status,
    })
    .from(matchesTable)
    .innerJoin(
      matchProviderMappingTable,
      and(
        eq(matchProviderMappingTable.matchId, matchesTable.id),
        eq(matchProviderMappingTable.provider, "goalapi"),
      ),
    )
    .where(and(eq(matchesTable.sport, "football"), inArray(matchesTable.status, ["scheduled", "live"])));

  if (goalApiRows.length === 0) return [];

  const matchIds = goalApiRows.map((r) => r.matchId);
  const alreadyMappedRows = await db
    .select({ matchId: matchProviderMappingTable.matchId })
    .from(matchProviderMappingTable)
    .where(
      and(
        eq(matchProviderMappingTable.provider, excludeProvider),
        inArray(matchProviderMappingTable.matchId, matchIds),
      ),
    );
  const alreadyMapped = new Set(alreadyMappedRows.map((r) => r.matchId));

  return goalApiRows.filter((r) => !alreadyMapped.has(r.matchId));
}

export type MatchedLiveFootballFixture = {
  matchId: number;
  goalApiProviderMatchId: string;
  otherProviderMatchId: string;
  otherProviderConfidence: number;
};

/** Currently-live football canonical matches that have BOTH a goalapi
 * mapping and a mapping from `otherProvider` — the worklist for comparing
 * a second provider's odds against what's currently live, once matching
 * has already found the pair (see getUnmatchedGoalApiFootballMatches).
 * Same two-query + in-process join style as that function, for the same
 * reason: small result set, clarity over a marginal query-count saving. */
export async function getMatchedLiveFootballFixtures(
  otherProvider: string,
): Promise<MatchedLiveFootballFixture[]> {
  const otherProviderRows = await db
    .select({ matchId: matchProviderMappingTable.matchId, providerMatchId: matchProviderMappingTable.providerMatchId, confidence: matchProviderMappingTable.confidence })
    .from(matchProviderMappingTable)
    .where(eq(matchProviderMappingTable.provider, otherProvider));
  if (otherProviderRows.length === 0) return [];
  const otherByMatchId = new Map<number, (typeof otherProviderRows)[number]>(
    otherProviderRows.map((r) => [r.matchId, r]),
  );

  const liveMatchIds = (
    await db
      .select({ matchId: matchesTable.id })
      .from(matchesTable)
      .where(and(eq(matchesTable.sport, "football"), eq(matchesTable.status, "live")))
  ).map((r) => r.matchId);
  if (liveMatchIds.length === 0) return [];

  const goalApiRows = await db
    .select({ matchId: matchProviderMappingTable.matchId, providerMatchId: matchProviderMappingTable.providerMatchId })
    .from(matchProviderMappingTable)
    .where(
      and(
        eq(matchProviderMappingTable.provider, "goalapi"),
        inArray(matchProviderMappingTable.matchId, liveMatchIds),
      ),
    );

  const result: MatchedLiveFootballFixture[] = [];
  for (const row of goalApiRows) {
    const other = otherByMatchId.get(row.matchId);
    if (!other) continue;
    result.push({
      matchId: row.matchId,
      goalApiProviderMatchId: row.providerMatchId,
      otherProviderMatchId: other.providerMatchId,
      otherProviderConfidence: other.confidence,
    });
  }
  return result;
}

export type ProviderMappingInput = {
  matchId: number;
  provider: string;
  providerSport: string;
  providerMatchId: string;
  home: string;
  away: string;
  /** Caller-computed confidence (e.g. from a real matching engine) — unlike
   * ensureCanonicalMatch's fixed 100 for a single, unambiguous source. */
  confidence: number;
};

/** Attaches a SECOND (or later) provider's mapping to an EXISTING canonical
 * match. Never creates a new canonical_matches row — only
 * ensureCanonicalMatch does that, and only for the provider that owns match
 * identity (GOAL API today), preserving the rule that GOAL API stays the
 * source of truth for which matches exist at all. */
export async function attachProviderMapping(input: ProviderMappingInput): Promise<void> {
  const provider = String(input.provider ?? "").trim();
  const providerSport = normalizeCatalogValue(input.providerSport);
  const providerMatchId = String(input.providerMatchId ?? "").trim();
  const home = String(input.home ?? "").trim();
  const away = String(input.away ?? "").trim();
  if (!provider || !providerSport || !providerMatchId || !home || !away) return;

  const [existing] = await db
    .select({ matchId: matchProviderMappingTable.matchId })
    .from(matchProviderMappingTable)
    .where(
      and(
        eq(matchProviderMappingTable.provider, provider),
        eq(matchProviderMappingTable.providerSport, providerSport),
        eq(matchProviderMappingTable.providerMatchId, providerMatchId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(matchProviderMappingTable)
      .set({
        homeNameRaw: home,
        awayNameRaw: away,
        confidence: input.confidence,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(matchProviderMappingTable.provider, provider),
          eq(matchProviderMappingTable.providerSport, providerSport),
          eq(matchProviderMappingTable.providerMatchId, providerMatchId),
        ),
      );
    return;
  }

  await db
    .insert(matchProviderMappingTable)
    .values({
      provider,
      providerSport,
      providerMatchId,
      matchId: input.matchId,
      homeNameRaw: home,
      awayNameRaw: away,
      confidence: input.confidence,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

const CANONICAL_MATCH_SYNC_INTERVAL_MS = 60_000; // same cadence as syncLiveCompetitionCatalog
let lastCanonicalMatchSyncAt = 0;
let canonicalMatchSyncInFlight: Promise<void> | null = null;

async function syncCanonicalMatchesInternal(inputs: SeenMatchInput[]): Promise<void> {
  for (const input of inputs) {
    try {
      await ensureCanonicalMatch(input);
    } catch (err) {
      logger.error({ err, providerMatchId: input.providerMatchId }, "[canonical-match] ensure failed");
    }
  }
}

/** Fire-and-forget, throttled — safe to call on every poll tick with the
 * full current fixture list, same calling convention as
 * syncLiveCompetitionCatalog. No-ops silently when DATABASE_URL isn't set
 * (db.insert/select throw on the mock pool, caught per-item above). */
export function syncCanonicalMatches(inputs: SeenMatchInput[]): void {
  if (inputs.length === 0) return;
  const now = Date.now();
  if (canonicalMatchSyncInFlight) return;
  if (now - lastCanonicalMatchSyncAt < CANONICAL_MATCH_SYNC_INTERVAL_MS) return;
  lastCanonicalMatchSyncAt = now;
  canonicalMatchSyncInFlight = syncCanonicalMatchesInternal(inputs)
    .catch((err) => logger.error({ err }, "[canonical-match] sync failed"))
    .finally(() => {
      canonicalMatchSyncInFlight = null;
    });
}
