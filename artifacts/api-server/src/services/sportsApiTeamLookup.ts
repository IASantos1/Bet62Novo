// Resolves a bare team NAME (all PulseScore gives us — see
// buildFootballLiveFromPulseScore in routes/matches.ts) to a SportsAPI Pro
// competitorId, so the existing /team-logo/:sport/:teamId route (built for
// the old Statpal/SportsAPI-Pro pipeline, which always had an ID already)
// can still resolve a real crest for PulseScore-sourced live matches.
//
// Endpoint confirmed by the user against SportsAPI Pro's own docs
// (2026-08-07): GET https://api.sportsapipro.com/v1/{sport}/search
// ?query=<name>&filter=competitors, header x-api-key, response
// { competitors: [{ id, name, countryId, countryName, popularityRank }], ... }.
// This is the *search* API (different host/quota from the /images endpoint
// routes/matches.ts already calls) and explicitly "conta para sua cota
// diária" per that doc — never call it synchronously in the ~1s live
// broadcast loop. Every result (including "not found") is cached in memory
// and reused; resolveTeamIdInBackground is fire-and-forget so a cache miss
// costs the current tick nothing (no logo yet) rather than blocking it.
import { CONFIG } from "../lib/config.js";
import { logger } from "../lib/logger.js";

type CacheEntry = { id: string | null; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<void>>();

// Team identity is effectively permanent, so a resolved id is cached for a
// long time. A "not found" is retried daily instead of forever, in case
// SportsAPI Pro's own catalog gains coverage for a smaller club later.
const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function cacheKey(sport: string, name: string): string {
  return `${sport}:${normalize(name)}`;
}

type SearchResponse = {
  competitors?: Array<{
    id: string;
    name: string;
    countryId?: number;
    countryName?: string;
    popularityRank?: number;
  }>;
};

async function searchTeamId(sport: string, name: string): Promise<string | null> {
  const url = new URL(`https://api.sportsapipro.com/v1/${encodeURIComponent(sport)}/search`);
  url.searchParams.set("query", name);
  url.searchParams.set("filter", "competitors");
  const resp = await fetch(url.toString(), {
    headers: { "x-api-key": CONFIG.SPORTSAPI_KEY },
    signal: AbortSignal.timeout(5_000),
  });
  if (!resp.ok) {
    throw new Error(`[sportsapi-search] ${resp.status} on ${sport} search for "${name}"`);
  }
  const data = (await resp.json()) as SearchResponse;
  const competitors = Array.isArray(data.competitors) ? data.competitors : [];
  if (competitors.length === 0) return null;
  // Prefer an exact (case-insensitive) name match; otherwise the doc's own
  // recommendation is the highest popularityRank — never guess a partial
  // match, that risks attaching a different club's crest to the wrong team.
  const exact = competitors.find((c) => normalize(c.name) === normalize(name));
  if (exact) return exact.id;
  const byPopularity = [...competitors].sort(
    (a, b) => (b.popularityRank ?? 0) - (a.popularityRank ?? 0),
  );
  return byPopularity[0]?.id ?? null;
}

/** Synchronous, non-blocking cache read. Returns:
 *  - a string competitorId if resolved and known good,
 *  - null if a previous search confirmed no match (still within TTL),
 *  - undefined if never looked up yet, or the cached entry expired.
 * Callers should treat both null and undefined as "no logo this tick" and
 * pair this with resolveTeamIdInBackground to populate the cache for next
 * time. */
export function getCachedTeamId(sport: string, name: string): string | null | undefined {
  if (!name.trim()) return undefined;
  const entry = cache.get(cacheKey(sport, name));
  if (!entry) return undefined;
  const ttl = entry.id === null ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS;
  if (Date.now() - entry.fetchedAt > ttl) return undefined;
  return entry.id;
}

/** Fire-and-forget: kicks off a background /search call if this name isn't
 * already cached (fresh) or already in flight. Safe to call every tick from
 * a live builder loop — costs nothing beyond a Map lookup once resolved. */
export function resolveTeamIdInBackground(sport: string, name: string): void {
  if (!name.trim() || !CONFIG.SPORTSAPI_KEY) return;
  const key = cacheKey(sport, name);
  if (getCachedTeamId(sport, name) !== undefined) return;
  if (inFlight.has(key)) return;

  const task = searchTeamId(sport, name)
    .then((id) => {
      cache.set(key, { id, fetchedAt: Date.now() });
    })
    .catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), sport, name },
        "[sportsapi-search] team lookup failed — will retry next tick",
      );
      // Deliberately NOT cached on failure (network/5xx/quota) — a real
      // "not found" (empty competitors[]) is the only outcome cached as
      // null above, so a transient failure gets retried on the next tick
      // instead of being stuck for NEGATIVE_TTL_MS.
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, task);
}
