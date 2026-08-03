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
// AUTO-EXTRACTION: On top of the typed desc/state/score fields, every chunk
// is also scanned for URLs (deep-walk) matching the SMYTDRYT HLS pattern
// (playlist.m3u8 + match_id/s_id/t_id/stats/timestamp/key params). When
// found, those 7 parameters are extracted and returned alongside the
// event so the poller can auto-save them into live_stream_mappings
// WITHOUT any admin intervention — this removes the manual mapping step
// for the stream side whenever BetBY embeds the stream URL in its feed.
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

// Typed subset plus everything else (stream/video URLs may live under any
// key not yet documented — `rest` catches them for deep-scanning).
interface BetbyEventChunk {
  desc?: BetbyEventDesc;
  state?: BetbyEventState;
  score?: BetbyEventScore;
  markets?: unknown;
  [k: string]: unknown;
}

interface BetbyChunkResponse {
  sports?: Record<string, { name?: string; slug?: string }>;
  categories?: Record<string, { name?: string; country_code?: string }>;
  tournaments?: Record<string, { name?: string }>;
  events?: Record<string, BetbyEventChunk>;
  [k: string]: unknown;
}

export interface BetbyExtractedVideo {
  matchId: number;
  sportId: number;
  tournamentId: number;
  statsHost: string;
  key: string;
  basePath: string;
  timestamp: number;
}

// Accumulated per-event state, merged across polls — see module doc comment.
interface CachedBetbyEvent {
  desc?: BetbyEventDesc;
  state?: BetbyEventState;
  score?: BetbyEventScore;
  extractedVideo?: BetbyExtractedVideo;
  rawExtraKeys?: string[];
}

const rawEventCache = new Map<string, CachedBetbyEvent>();
// sportId/categoryId/tournamentId → display name, accumulated the same way
// (these dictionaries are small and appear to be resent in full each
// chunk, but merging costs nothing and is safe either way).
const sportNames = new Map<string, string>();
const categoryNames = new Map<string, string>();
const tournamentNames = new Map<string, string>();

// Keys observed across events that are NOT in our typed subset. Once per
// distinct key we log at info level so admins can discover new
// undocumented fields the feed starts carrying (stream URLs, tracker IDs,
// custom metadata, etc.) without digging into HTTP captures.
const seenExtraKeys = new Set<string>();

function apiUrl(path: string): string {
  return `${CONFIG.BETBY_API_BASE_URL}${path}`;
}

function betbyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (CONFIG.BETBY_ORIGIN) headers["Origin"] = CONFIG.BETBY_ORIGIN;
  if (CONFIG.BETBY_REFERER) headers["Referer"] = CONFIG.BETBY_REFERER;
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

// ── Deep URL scan + SMYTDRYT parameter extraction ──────────────────────────

const SMYTDRYT_HOST_RE = /smytdryt\.live\//i;
const M3U8_RE = /playlist\.m3u8/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function extractSmytdrytFromUrl(rawUrl: string): BetbyExtractedVideo | null {
  try {
    let urlStr = rawUrl;
    if (urlStr.startsWith("//")) urlStr = "https:" + urlStr;
    if (!/^https?:/i.test(urlStr)) return null;
    const u = new URL(urlStr);
    if (!SMYTDRYT_HOST_RE.test(u.hostname + u.pathname) && !M3U8_RE.test(u.pathname)) return null;
    const matchId = u.searchParams.get("match_id");
    const sportId = u.searchParams.get("s_id");
    const tournamentId = u.searchParams.get("t_id");
    const statsHost = u.searchParams.get("stats");
    const timestamp = u.searchParams.get("timestamp");
    const key = u.searchParams.get("key");
    if (!matchId || !sportId || !tournamentId || !timestamp || !key) return null;
    const m = u.pathname.match(/\/([a-fA-F0-9]{16,64})\/playlist\.m3u8$/i);
    const basePath = m ? m[1]! : "";
    if (!basePath && !M3U8_RE.test(u.pathname)) return null;
    return {
      matchId: Number(matchId),
      sportId: Number(sportId),
      tournamentId: Number(tournamentId),
      statsHost: statsHost || CONFIG.SMYTDRYT_DEFAULT_STATS_HOST,
      key,
      basePath,
      timestamp: Number(timestamp),
    };
  } catch {
    return null;
  }
}

function deepScanUrls(node: unknown, out: BetbyExtractedVideo[]): void {
  if (!node) return;
  if (typeof node === "string") {
    if (node.length > 30 && (node.includes("http") || node.includes("playlist.m3u8"))) {
      // There may be multiple URLs concatenated or embedded; try the full
      // string first then fall back to regex extraction on matches.
      const direct = extractSmytdrytFromUrl(node);
      if (direct) {
        out.push(direct);
        return;
      }
      const re = /https?:\/\/[^\s"'<>]+/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(node))) {
        const v = extractSmytdrytFromUrl(m[0]);
        if (v) out.push(v);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) deepScanUrls(item, out);
    return;
  }
  if (isPlainObject(node)) {
    for (const k of Object.keys(node)) deepScanUrls((node as any)[k], out);
  }
}

function extractVideoInfo(chunk: BetbyEventChunk): BetbyExtractedVideo | null {
  const found: BetbyExtractedVideo[] = [];
  deepScanUrls(chunk, found);
  if (found.length === 0) return null;
  // Prefer the entry with all 7 fields filled in; if multiple, pick the
  // freshest timestamp.
  found.sort((a, b) => {
    const score = (v: BetbyExtractedVideo) =>
      (v.basePath ? 1 : 0) + (v.key ? 1 : 0) + (v.statsHost ? 1 : 0);
    const d = score(b) - score(a);
    return d !== 0 ? d : b.timestamp - a.timestamp;
  });
  return found[0]!;
}

const TYPED_EVENT_KEYS = new Set(["desc", "state", "score", "markets"]);
function recordExtraKeys(eventChunk: BetbyEventChunk, betbyEventId: string): string[] {
  const extras: string[] = [];
  for (const k of Object.keys(eventChunk)) {
    if (TYPED_EVENT_KEYS.has(k)) continue;
    extras.push(k);
    if (!seenExtraKeys.has(k)) {
      seenExtraKeys.add(k);
      logger.info(
        { key: k, betbyEventId, sampleType: typeof (eventChunk as any)[k] },
        "[betby] NEW untyped event key observed in feed — candidate for auto-extraction",
      );
    }
  }
  return extras;
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
    const extraKeys = recordExtraKeys(ev, eventId);
    const video = extractVideoInfo(ev);
    rawEventCache.set(eventId, {
      desc: ev.desc ?? existing.desc,
      state: ev.state ?? existing.state,
      score: ev.score ?? existing.score,
      extractedVideo: video ?? existing.extractedVideo,
      rawExtraKeys:
        extraKeys.length > 0
          ? Array.from(new Set([...(existing.rawExtraKeys ?? []), ...extraKeys]))
          : existing.rawExtraKeys,
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

// Purely-numeric competitor names ("290398", "371649"...) are BetBY's own
// internal outcome IDs leaking through — a real signal (confirmed from
// production data) that the event is a special/novelty prop market
// ("Which company has the best AI model...?", "US x Iran diplomatic
// meeting...?", "Survivor 50 Winner") rather than a real two-team match, and
// isn't caught by the `desc.virtual` (simulated-sport) check above.
const NUMERIC_NAME = /^\d+$/;

export function getCachedExtractedVideo(betbyEventId: string): BetbyExtractedVideo | null {
  return rawEventCache.get(betbyEventId)?.extractedVideo ?? null;
}

export function listAllExtractedVideos(): Array<{ betbyEventId: string; video: BetbyExtractedVideo }> {
  const out: Array<{ betbyEventId: string; video: BetbyExtractedVideo }> = [];
  for (const [id, cached] of rawEventCache.entries()) {
    if (cached.extractedVideo) out.push({ betbyEventId: id, video: cached.extractedVideo });
  }
  return out;
}

function toLiveEvent(betbyEventId: string, cached: CachedBetbyEvent): LiveEvent | null {
  const desc = cached.desc;
  if (!desc || desc.virtual) return null; // no team names yet, or a virtual/simulated event — skip
  const [home, away] = desc.competitors ?? [];
  if (!home?.name || !away?.name) return null;
  if (NUMERIC_NAME.test(home.name.trim()) || NUMERIC_NAME.test(away.name.trim())) return null;

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
