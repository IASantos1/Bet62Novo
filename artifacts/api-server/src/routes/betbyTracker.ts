import { Router, type Request, type Response } from "express";
import {
  BETBY_TRACKER_RESPONSE_HEADERS,
  fetchBetbyTrackerHtml,
  buildBetbyTrackerUpstreamUrl,
  buildBetbyTrackerPublicUrl,
  type BetbyThemeInjection,
} from "../services/betbyTracker/proxy.js";
import { listMappings } from "../services/liveStream/mapping.js";
import { teamNamesMatch } from "../services/pulsescore/teamMatch.js";
import {
  resolveBetbyMatchMeta,
  listBetbyLiveEvents,
  findBetbyLiveEventByTeams,
  betbySportIdForPulseSport,
} from "../services/betbyTracker/pulseBridge.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Bet62's own outward Match.sport field says "football" (e.g. every match
// object served by routes/matches.ts, and what the frontend actually
// sends here) — but PulseScoreEvent.sport (and therefore
// BETBY_SPORT_ID_TO_PULSE_SPORT's values, which findBetbyLiveEventByTeams
// and betbySportIdForPulseSport are keyed against) uses "soccer" for the
// exact same sport (see matches.ts's `ev.sport !== "soccer"` checks).
// Without this translation every football/soccer match would silently
// fail the sport-family filter in findBetbyLiveEventByTeams (comparing
// "football" against a set that only ever contains "soccer") and
// betbySportIdForPulseSport would fall through to its "1" default only by
// accident, not by design.
function normalizeToPulseSportKey(sport: string): string {
  return sport === "football" ? "soccer" : sport;
}

const DEFAULT_THEME: BetbyThemeInjection = {
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  backgroundMain: "rgba(12, 22, 33, 1)",
  elementBgPrimary: "rgba(30, 48, 66, 1)",
  elementBgSecondary: "rgba(20, 36, 50, 1)",
  highlight: "rgba(34, 197, 94, 1)",
  lines: "rgba(255, 255, 255, 0.08)",
  contrast: "rgba(255, 255, 255, 1)",
};

function getOriginFromRequest(req: Request): string | undefined {
  const origin = req.headers["origin"] || req.headers["referer"];
  if (typeof origin === "string" && origin.length > 0) {
    try {
      const u = new URL(origin);
      return `${u.protocol}//${u.host}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Finds a betbyEventId for a Bet62 match, any sport. Two layers, tried in
 *  order (user request 2026-08-13 — this used to ONLY check the manual
 *  admin table below, so the Tracker only ever worked for the handful of
 *  matches an admin had hand-mapped):
 *   1. Auto-discovery against BetBY's OWN currently-live event catalogue
 *      (listBetbyLiveEvents), matched by team name AND sport family
 *      (findBetbyLiveEventByTeams) — works for any match, any sport, with
 *      no manual setup, as long as BetBY's demo brand happens to be
 *      carrying that fixture right now.
 *   2. live_stream_mappings (admin-managed, originally built for the video
 *      stream side — see services/liveStream/mapping.ts's own header) as a
 *      fallback/manual-pin path, kept exactly as it worked before.
 *  Returns null if neither finds an acceptable candidate. */
async function resolveBetbyEventIdByName(
  home: string,
  away: string,
  pulseSport: string,
): Promise<{ betbyEventId: string; confidence: number } | null> {
  if (!home || !away) return null;
  try {
    const liveEvents = await listBetbyLiveEvents();
    const liveMatch = findBetbyLiveEventByTeams(home, away, pulseSport, liveEvents);
    if (liveMatch) return { betbyEventId: liveMatch.betbyEventId, confidence: 3 };
  } catch (err) {
    logger.warn({ err, home, away, pulseSport }, "[betbyTracker] live-catalogue auto-match failed");
  }
  try {
    const rows = await listMappings();
    let best: { betbyEventId: string; confidence: number } | null = null;
    for (const row of rows) {
      const hOk = teamNamesMatch(row.home, home);
      const aOk = teamNamesMatch(row.away, away);
      const hOkSwap = teamNamesMatch(row.away, home);
      const aOkSwap = teamNamesMatch(row.home, away);
      const direct = (hOk ? 2 : 0) + (aOk ? 1 : 0);
      const swapped = (hOkSwap ? 2 : 0) + (aOkSwap ? 1 : 0);
      const score = Math.max(direct, swapped);
      if (score >= 3) return { betbyEventId: row.betbyEventId, confidence: 3 };
      if (score >= 1 && (!best || score > best.confidence)) {
        best = { betbyEventId: row.betbyEventId, confidence: score };
      }
    }
    return best;
  } catch (err) {
    logger.warn({ err, home, away }, "[betbyTracker] resolveBetbyEventIdByName failed");
    return null;
  }
}

/** Resolve o betbyEventId se não foi passado (query home+away) e retorna o
 *  objeto com o id final + url pública direta do BetBY + url via proxy.
 *  Opcionalmente usado pelo frontend quando VITE_USE_BETBY_DIRECT_IFRAME=true
 *  (iframe aponta DIRETO para demo.betby.com sem passar HTML pelo node). */
async function resolveFinalBetbyEventId(
  req: Request,
): Promise<{ finalBetbyEventId: string | null; error?: { code: number; msg: string } }> {
  const home = typeof req.query.home === "string" ? req.query.home.trim() : "";
  const away = typeof req.query.away === "string" ? req.query.away.trim() : "";
  // Bet62/PulseScore sport key ("football", "tennis", "basketball", ...) —
  // NOT BetBY's own numeric sportId. Defaults to football only for
  // backwards compatibility with any caller still not passing it; every
  // current frontend call site does pass its match's real sport.
  const sport = normalizeToPulseSportKey(
    typeof req.query.sport === "string" && req.query.sport.trim()
      ? req.query.sport.trim().toLowerCase()
      : "football",
  );
  const betbyEventId = typeof req.query.betbyEventId === "string"
    ? req.query.betbyEventId.trim()
    : "";
  let finalBetbyEventId = betbyEventId;
  if (!finalBetbyEventId) {
    if (!home || !away) {
      return {
        finalBetbyEventId: null,
        error: { code: 400, msg: "Missing required query params: betbyEventId OR (home AND away)" },
      };
    }
    const byName = await resolveBetbyEventIdByName(home, away, sport);
    if (!byName) {
      return {
        finalBetbyEventId: null,
        error: { code: 404, msg: `No BetBY match mapping found for "${home}" vs "${away}".` },
      };
    }
    finalBetbyEventId = byName.betbyEventId;
  }

  if (!finalBetbyEventId || finalBetbyEventId.length < 6 || !/^\d+$/.test(finalBetbyEventId)) {
    return {
      finalBetbyEventId: null,
      error: { code: 400, msg: "Invalid betbyEventId (expected numeric id)" },
    };
  }
  return { finalBetbyEventId };
}

router.get("/url", async (req: Request, res: Response) => {
  try {
    const lang = typeof req.query.lang === "string" && req.query.lang.length > 0
      ? req.query.lang
      : "pt-br";
    // Bug report 2026-08-13: the Tracker only ever worked (when it worked
    // at all) for football, because sportId was hardcoded to "1" on the
    // frontend regardless of the match's real sport — a tennis or
    // basketball match would ask BetBY's tracker widget to render as
    // football. `sport` (Bet62/PulseScore's own sport key) is now the
    // primary source of truth, converted to BetBY's numeric convention via
    // betbySportIdForPulseSport; an explicit `sportId` query param is still
    // honored when passed on its own (no `sport`), for any caller that
    // already knows BetBY's raw numeric id directly.
    const sportParam = typeof req.query.sport === "string" ? req.query.sport.trim().toLowerCase() : "";
    const sportId = sportParam
      ? betbySportIdForPulseSport(normalizeToPulseSportKey(sportParam))
      : typeof req.query.sportId === "string" && req.query.sportId.length > 0
        ? req.query.sportId
        : "1";
    const parentOrigin = getOriginFromRequest(req) ?? "*";
    const resolved = await resolveFinalBetbyEventId(req);
    if (resolved.error) {
      return res.status(200).json({
        ok: false,
        error: resolved.error.msg,
        errorCode: resolved.error.code,
        upstream: null,
        proxy: null,
        pulseSse: null,
        finalBetbyEventId: null,
      });
    }
    const finalBetbyEventId = resolved.finalBetbyEventId!;
    const publicDirectUrl = buildBetbyTrackerPublicUrl({
      betbyEventId: finalBetbyEventId,
      lang,
      sportId,
    });
    const apiBase = `${req.protocol}://${req.get("host") ?? ""}`;
    const proxyUrl = `${apiBase}/api/betby-live-tracker/${encodeURIComponent(finalBetbyEventId)}?lang=${encodeURIComponent(lang)}&sportId=${encodeURIComponent(sportId)}`;
    void resolveBetbyMatchMeta(finalBetbyEventId, 3500).catch(() => null);
    return res.status(200).json({
      ok: true,
      finalBetbyEventId,
      upstream: publicDirectUrl,
      direct: true,
      lang,
      sportId,
      parentOrigin,
      proxy: proxyUrl,
      pulseSse: `${apiBase}/api/pulsebridge/betby/${encodeURIComponent(finalBetbyEventId)}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      ok: false,
      error: msg,
      errorCode: 500,
      upstream: null,
      proxy: null,
      pulseSse: null,
      finalBetbyEventId: null,
    });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const lang = typeof req.query.lang === "string" && req.query.lang.length > 0
    ? req.query.lang
    : "pt-br";
  const sportId = typeof req.query.sportId === "string" && req.query.sportId.length > 0
    ? req.query.sportId
    : "1";
  const resolved = await resolveFinalBetbyEventId(req);
  if (resolved.error) {
    return res
      .status(resolved.error.code)
      .type("text/plain")
      .send(resolved.error.msg);
  }
  const finalBetbyEventId = resolved.finalBetbyEventId!;

  try {
    const parentOrigin = getOriginFromRequest(req) ?? "*";
    await resolveBetbyMatchMeta(finalBetbyEventId, 3500)
      .catch(() => null);
    const upstreamPreview = buildBetbyTrackerUpstreamUrl({
      betbyEventId: finalBetbyEventId,
      lang,
      sportId,
    });
    const { html, upstreamUrl } = await fetchBetbyTrackerHtml({
      betbyEventId: finalBetbyEventId,
      lang,
      sportId,
      theme: DEFAULT_THEME,
      parentOrigin,
    });
    res.set({
      ...BETBY_TRACKER_RESPONSE_HEADERS,
      "X-Bet62-Upstream": upstreamPreview,
      "X-Bet62-Upstream-Real": upstreamUrl,
    });
    return res.status(200).send(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res
      .status(502)
      .type("text/plain")
      .send(`Failed to proxy BetBY tracker (Bet62 bridge): ${msg}`);
  }
});

router.get("/:betbyEventId", async (req: Request, res: Response) => {
  try {
    const betbyEventId = String(req.params.betbyEventId);
    if (!betbyEventId || betbyEventId.length < 6 || !/^\d+$/.test(betbyEventId)) {
      return res.status(400).type("text/plain").send("Invalid betbyEventId (expected numeric id)");
    }
    const lang = typeof req.query.lang === "string" && req.query.lang.length > 0
      ? req.query.lang
      : "pt-br";
    const sportId = typeof req.query.sportId === "string" && req.query.sportId.length > 0
      ? req.query.sportId
      : "1";
    const parentOrigin = getOriginFromRequest(req) ?? "*";

    const upstreamPreview = buildBetbyTrackerUpstreamUrl({
      betbyEventId,
      lang,
      sportId,
    });

    const { html, upstreamUrl } = await fetchBetbyTrackerHtml({
      betbyEventId,
      lang,
      sportId,
      theme: DEFAULT_THEME,
      parentOrigin,
    });

    res.set({
      ...BETBY_TRACKER_RESPONSE_HEADERS,
      "X-Bet62-Upstream": upstreamPreview,
      "X-Bet62-Upstream-Real": upstreamUrl,
    });
    return res.status(200).send(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res
      .status(502)
      .type("text/plain")
      .send(`Failed to proxy BetBY tracker (Bet62 bridge): ${msg}`);
  }
});

export default router;
