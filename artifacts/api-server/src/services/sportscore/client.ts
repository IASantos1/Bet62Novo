// SportScore (sportscore.com) — free, keyless, open-CORS REST API for real
// live scores/fixtures (confirmed public docs: sportscore.com/developers/,
// endpoint paths cross-checked against the open-source sportscore-mcp
// project, which wraps this exact API). Unlike BetBY's zero-config default
// (demoapi.betby.com — a sandbox/demo brand with a limited test-fixture
// catalogue, not real match coverage), SportScore's data is real, which is
// what makes automatic team-name matching actually viable here.
//
// Built 2026-08-16 without live access to sportscore.com from the
// environment this was written in (network egress blocked in that sandbox,
// same restriction that affected the BetBY work earlier this session) — the
// endpoint paths and query params ARE confirmed (from the public docs and
// the sportscore-mcp source, which hits these exact routes), but the exact
// JSON field names inside each match/tracker object were NOT independently
// verified against a real response. normalizeSportscoreMatch/
// normalizeSportscoreTracker below are deliberately tolerant — they try
// several plausible field-name variants rather than assuming one shape —
// and recordUnknownSportscoreShape logs the raw response once so the first
// real call in production immediately shows whether the guesses were right,
// the same confirm-with-real-evidence approach already established
// elsewhere in this codebase (see e.g. football.ts's
// recordUnknownGoalscorerRawName). Tighten the field list here once that
// log line shows the real shape.
import { logger } from "../../lib/logger.js";
import { teamNamesMatch } from "../pulsescore/teamMatch.js";

export const SPORTSCORE_BASE = "https://sportscore.com";

const FETCH_TIMEOUT_MS = 6000;
const COMMON_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
} as const;

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS, signal: controller.signal });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "[sportscore] non-OK response");
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, "[sportscore] fetch failed");
    return null;
  } finally {
    clearTimeout(to);
  }
}

// Tries every plausible shape a "list of matches" JSON body could take —
// a bare array, or an array nested under one of a handful of common wrapper
// keys — without assuming which one sportscore.com actually uses.
function extractMatchArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["matches", "data", "results", "events", "items"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

const seenUnknownShapes = new Set<string>();
function recordUnknownSportscoreShape(context: string, body: unknown): void {
  if (seenUnknownShapes.has(context)) return;
  seenUnknownShapes.add(context);
  logger.warn(
    { context, sample: JSON.stringify(body).slice(0, 2000) },
    "[sportscore] unrecognized response shape — logging raw sample to confirm real field names",
  );
}

export type SportscoreMatchSummary = {
  sportscoreId: string;
  trackerId: string | null;
  home: string;
  away: string;
  sport: string;
};

function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return null;
}

export function normalizeSportscoreMatch(raw: unknown, sport: string): SportscoreMatchSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const teams = (o["teams"] ?? {}) as Record<string, unknown>;
  const homeObj = (teams["home"] ?? o["home"]) as Record<string, unknown> | string | undefined;
  const awayObj = (teams["away"] ?? o["away"]) as Record<string, unknown> | string | undefined;
  const home = firstString(
    typeof homeObj === "string" ? homeObj : homeObj?.["name"],
    o["homeTeam"],
    o["home_team"],
    o["homeTeamName"],
    o["localTeam"],
  );
  const away = firstString(
    typeof awayObj === "string" ? awayObj : awayObj?.["name"],
    o["awayTeam"],
    o["away_team"],
    o["awayTeamName"],
    o["visitorTeam"],
  );
  const sportscoreId = firstString(o["slug"], o["id"], o["matchId"], o["match_id"]);
  const trackerId = firstString(o["trackerId"], o["tracker_id"], o["id"]);
  if (!home || !away || !sportscoreId) return null;
  return { sportscoreId, trackerId, home, away, sport };
}

/** GET /api/widget/matches/?sport={sport}&limit={limit} — real SportScore
 * fixtures list (confirmed real endpoint path; field names are best-effort,
 * see this module's header comment). Returns [] on any failure — callers
 * treat that the same as "no match found", never as an error to surface. */
export async function fetchSportscoreMatches(
  sport: string,
  limit = 50,
): Promise<SportscoreMatchSummary[]> {
  const url = `${SPORTSCORE_BASE}/api/widget/matches/?sport=${encodeURIComponent(sport)}&limit=${limit}&src=bet62.plus`;
  const body = await fetchJson(url);
  if (body == null) return [];
  const arr = extractMatchArray(body);
  if (!arr) {
    recordUnknownSportscoreShape(`matches:${sport}`, body);
    return [];
  }
  const out: SportscoreMatchSummary[] = [];
  for (const raw of arr) {
    const m = normalizeSportscoreMatch(raw, sport);
    if (m) out.push(m);
  }
  if (arr.length > 0 && out.length === 0) {
    // The array shape was right but nothing inside it normalized — the
    // per-match field names are the part that's actually wrong, not the
    // envelope. Log one raw match object specifically, more useful for
    // fixing normalizeSportscoreMatch than the whole array dump above.
    recordUnknownSportscoreShape(`match-fields:${sport}`, arr[0]);
  }
  return out;
}

/** Finds the best team-name match for `home`/`away` within `sport`'s
 * current SportScore fixtures list. Real fixtures only — unlike BetBY's
 * demo catalogue, a miss here means SportScore genuinely doesn't have this
 * match right now (wrong window, not yet listed, very minor competition),
 * not that the data source itself is fake. */
export async function resolveSportscoreMatchByTeams(
  sport: string,
  home: string,
  away: string,
): Promise<SportscoreMatchSummary | null> {
  if (!home || !away) return null;
  const matches = await fetchSportscoreMatches(sport);
  for (const m of matches) {
    const direct = teamNamesMatch(m.home, home) && teamNamesMatch(m.away, away);
    const swapped = teamNamesMatch(m.away, home) && teamNamesMatch(m.home, away);
    if (direct || swapped) return m;
  }
  return null;
}

export type SportscoreTrackerSummary = {
  provider: "sportscore";
  status: string;
  minute: string;
  homeScore: number;
  awayScore: number;
  incidents: Array<{ type: string; team: string; minute: number; player: string }>;
};

export function normalizeSportscoreTracker(raw: unknown): SportscoreTrackerSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const score = (o["score"] ?? {}) as Record<string, unknown>;
  const homeScore = Number(score["home"] ?? o["homeScore"] ?? o["home_score"] ?? 0);
  const awayScore = Number(score["away"] ?? o["awayScore"] ?? o["away_score"] ?? 0);
  const status = firstString(o["status"], o["state"]) ?? "unknown";
  const minute = firstString(o["minute"], o["clock"], o["time"]) ?? "";
  const incidentsRaw = (o["incidents"] ?? o["events"] ?? []) as unknown[];
  const incidents = Array.isArray(incidentsRaw)
    ? incidentsRaw
        .map((i) => {
          if (!i || typeof i !== "object") return null;
          const io = i as Record<string, unknown>;
          const type = firstString(io["type"], io["kind"]) ?? "unknown";
          const team = firstString(io["team"], io["side"]) ?? "";
          const minuteNum = Number(io["minute"] ?? io["time"] ?? 0);
          const player = firstString(io["player"], io["playerName"]) ?? "";
          return { type, team, minute: Number.isFinite(minuteNum) ? minuteNum : 0, player };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  return {
    provider: "sportscore",
    status,
    minute,
    homeScore: Number.isFinite(homeScore) ? homeScore : 0,
    awayScore: Number.isFinite(awayScore) ? awayScore : 0,
    incidents,
  };
}

/** GET /api/widget/tracker/?sport={sport}&id={trackerId} — raw live
 * position/animation JSON. Returns both the raw body (for admin debugging —
 * see the /sportscore-test route) and a best-effort normalized summary. */
export async function fetchSportscoreTracker(
  sport: string,
  trackerId: string,
): Promise<{ ok: boolean; status?: number; raw?: unknown; error?: string; mapped: SportscoreTrackerSummary | null }> {
  const url = `${SPORTSCORE_BASE}/api/widget/tracker/?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(trackerId)}&src=bet62.plus`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, mapped: null };
    const body = await res.json();
    const mapped = normalizeSportscoreTracker(body);
    if (!mapped) recordUnknownSportscoreShape(`tracker:${sport}`, body);
    return { ok: true, status: res.status, raw: body, mapped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), mapped: null };
  } finally {
    clearTimeout(to);
  }
}

/** Direct embeddable iframe URL for SportScore's own tracker widget.
 *
 * UNCONFIRMED (2026-08-17): this exact path was provided by the user as an
 * embed snippet allegedly copied from sportscore.com, but the site's own
 * published API docs (sportscore.com/embed/ — confirmed real, pasted in
 * full by the user) document ONLY JSON REST endpoints (/api/widget/matches/,
 * /api/widget/match/, /api/widget/tracker/ — the last one returns raw
 * position/animation JSON, explicitly NOT a renderable HTML page) and never
 * mention a ready-made iframe route at all. This path may be a real but
 * undocumented convenience feature (a per-match "share/embed" button), or it
 * may not exist — pending direct confirmation. If it turns out to be fake,
 * the real integration has to render its own mini-field from
 * /api/widget/match/ or /api/widget/tracker/'s JSON instead, the same way
 * this codebase's own MatchTracker/TrackerModal components already do for
 * other providers. */
export function buildSportscoreEmbedUrl(sport: string, slug: string): string {
  return `${SPORTSCORE_BASE}/embed/tracker/${encodeURIComponent(sport)}/${encodeURIComponent(slug)}/?src=bet62.plus`;
}
