import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import type { LiveEvent } from "./types.js";

// BetBY live feed — real contract confirmed from a captured response
// (see services/betby/client.ts's git history / PR description for the
// raw example). Two-step fetch:
//   1. GET {base}/api/v4/live/brand/{brandId}/{lang}/0 → manifest:
//        { version, top_events_versions: number[], rest_events_versions: number[], status: {...} }
//   2. GET {base}/api/v4/live/brand/{brandId}/{lang}/{version} → a chunk:
//        { sports, categories, tournaments, events: { [eventId]: {desc?, state?, score?, markets?} } }
// Chunks are DELTAS, not full snapshots: an event's `desc` (competitors/
// team names, sport, category, tournament) only appears the first time
// that event shows up in the feed — later chunks carrying updates for the
// same event only include whichever of state/score/markets changed. So a
// single poll is not enough to know an event's teams; rawEventCache below
// accumulates desc/state/score per betbyEventId across polls and only
// emits an event once its desc has been seen at least once. This does mean
// a freshly-restarted server won't show team names for matches that were
// already live before it started, until BetBY resends their desc (unclear
// how/when that happens) — an accepted limitation until more of the feed's
// behavior over time is observed.
//
// Markets/odds are intentionally never parsed or stored here — out of
// scope for this feature (Live + Match Tracker + Streaming only, no
// odds/markets, per the original spec).
//
// Auth is unconfirmed: BETBY_API_TOKEN is sent as a Bearer header when
// configured, but the request is also attempted without one, since the
// user's own reading of the WebSocket/JWT flow suggests it's for
// session/auth purposes unrelated to reading this feed.
let warnedNotConfigured = false;

interface BetbyManifest {
  version: number;
  top_events_versions?: number[];
  rest_events_versions?: number[];
}

interface BetbyCompetitor {
  id: string;
  sport_id: string;
  name: string;
}

interface BetbyEventDesc {
  scheduled?: number;
  type?: string;
  virtual?: boolean;
  slug?: string;
  sport?: string;
  category?: string;
  tournament?: string;
  competitors?: BetbyCompetitor[];
}

interface BetbyEventState {
  provider?: string;
  status?: number;
  match_status?: number;
  clock?: { match_time?: string; stopped?: boolean; timestamp?: number };
}

interface BetbyPeriodScore {
  match_status_code: number;
  number: number;
  home_score: number;
  away_score: number;
}

interface BetbyEventScore {
  home_score?: string;
  away_score?: string;
  period_scores?: BetbyPeriodScore[];
}

interface BetbyEventChunk {
  desc?: BetbyEventDesc;
  state?: BetbyEventState;
  score?: BetbyEventScore;
}

interface BetbyChunkResponse {
  sports?: Record<string, { name?: string; slug?: string }>;
  categories?: Record<string, { name?: string; country_code?: string }>;
  tournaments?: Record<string, { name?: string }>;
  events?: Record<string, BetbyEventChunk>;
}

// Accumulated per-event state, merged across polls — see module doc comment.
interface CachedBetbyEvent {
  desc?: BetbyEventDesc;
  state?: BetbyEventState;
  score?: BetbyEventScore;
}

const rawEventCache = new Map<string, CachedBetbyEvent>();
// sportId/categoryId/tournamentId → display name, accumulated the same way
// (these dictionaries are small and appear to be resent in full each
// chunk, but merging costs nothing and is safe either way).
const sportNames = new Map<string, string>();
const categoryNames = new Map<string, string>();
const tournamentNames = new Map<string, string>();

function apiUrl(path: string): string {
  return `${CONFIG.BETBY_API_BASE_URL}${path}`;
}

function betbyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (CONFIG.BETBY_API_TOKEN) headers["Authorization"] = `Bearer ${CONFIG.BETBY_API_TOKEN}`;
  return headers;
}

async function fetchManifest(): Promise<BetbyManifest | null> {
  const url = apiUrl(`/api/v4/live/brand/${CONFIG.BETBY_BRAND_ID}/${CONFIG.BETBY_LANG}/0`);
  const resp = await fetch(url, { headers: betbyHeaders(), signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`[betby] manifest fetch failed: HTTP ${resp.status}`);
  return (await resp.json()) as BetbyManifest;
}

async function fetchChunk(version: number): Promise<BetbyChunkResponse | null> {
  const url = apiUrl(`/api/v4/live/brand/${CONFIG.BETBY_BRAND_ID}/${CONFIG.BETBY_LANG}/${version}`);
  const resp = await fetch(url, { headers: betbyHeaders(), signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return null;
  return (await resp.json()) as BetbyChunkResponse;
}

function mergeChunk(chunk: BetbyChunkResponse): void {
  for (const [id, name] of Object.entries(chunk.sports ?? {})) {
    if (name?.slug) sportNames.set(id, name.slug);
  }
  for (const [id, cat] of Object.entries(chunk.categories ?? {})) {
    if (cat?.name) categoryNames.set(id, cat.name);
  }
  for (const [id, t] of Object.entries(chunk.tournaments ?? {})) {
    if (t?.name) tournamentNames.set(id, t.name);
  }
  for (const [eventId, ev] of Object.entries(chunk.events ?? {})) {
    const existing = rawEventCache.get(eventId) ?? {};
    rawEventCache.set(eventId, {
      desc: ev.desc ?? existing.desc,
      state: ev.state ?? existing.state,
      score: ev.score ?? existing.score,
    });
  }
}

// "LIVE" when there's a running clock, "FINISHED" when BetBY's own status
// flag (2 = observed alongside no clock/settled-looking events) says so,
// "PREMATCH" for anything scheduled but not yet started. match_status'
// exact enum isn't documented anywhere available, so this leans on the
// presence/absence of a clock rather than trying to enumerate every code.
function deriveStatus(state: BetbyEventState | undefined): LiveEvent["status"] {
  if (!state) return "PREMATCH";
  if (state.status === 3) return "FINISHED";
  if (state.clock?.match_time) return "LIVE";
  return "PREMATCH";
}

function toLiveEvent(betbyEventId: string, cached: CachedBetbyEvent): LiveEvent | null {
  const desc = cached.desc;
  if (!desc || desc.virtual) return null; // no team names yet, or a virtual/simulated event — skip
  const [home, away] = desc.competitors ?? [];
  if (!home?.name || !away?.name) return null;

  const score = cached.score;
  return {
    betbyEventId,
    sport: (desc.sport && sportNames.get(desc.sport)) || "unknown",
    league: (desc.tournament && tournamentNames.get(desc.tournament)) || "",
    country: (desc.category && categoryNames.get(desc.category)) || "",
    home: home.name.trim(),
    away: away.name.trim(),
    status: deriveStatus(cached.state),
    minute: cached.state?.clock?.match_time,
    score: {
      home: score?.home_score != null ? Number(score.home_score) : 0,
      away: score?.away_score != null ? Number(score.away_score) : 0,
    },
  };
}

export async function fetchBetbyLiveEvents(): Promise<LiveEvent[]> {
  if (!CONFIG.BETBY_API_BASE_URL || !CONFIG.BETBY_BRAND_ID) {
    if (!warnedNotConfigured) {
      logger.warn(
        "[betby] BETBY_API_BASE_URL/BETBY_BRAND_ID not configured — live poller disabled.",
      );
      warnedNotConfigured = true;
    }
    return [];
  }

  const manifest = await fetchManifest();
  if (!manifest) return [];
  const versions = [
    ...(manifest.top_events_versions ?? []),
    ...(manifest.rest_events_versions ?? []),
  ];

  const chunks = await Promise.all(
    versions.map((v) => fetchChunk(v).catch(() => null)),
  );
  for (const chunk of chunks) {
    if (chunk) mergeChunk(chunk);
  }

  const events: LiveEvent[] = [];
  for (const [betbyEventId, cached] of rawEventCache) {
    const event = toLiveEvent(betbyEventId, cached);
    if (event) events.push(event);
  }
  return events;
}
