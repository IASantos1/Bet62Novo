import { Router, type Request, type Response } from "express";
import {
  BETBY_TRACKER_RESPONSE_HEADERS,
  fetchBetbyTrackerHtml,
  buildBetbyTrackerUpstreamUrl,
  buildBetbyTrackerPublicUrl,
  resolveStatscoreEventIdFromBetby,
  buildClientRedirectBypassWafHtml,
  tryManualTeamStatscoreId,
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
// exact same sport (see matches.ts's ev.sport !== "soccer" checks).
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

// A failed fetchBetbyTrackerHtml (e.g. no resolvable Statscore event id —
// see that function's own comment) used to fall through to a bare
// text/plain 502 body. That's fine when this route is hit directly, but
// it's ALSO what ends up painted inside BetbyTrackerIframe's <iframe> when
// the failure happens there: the browser still fires onLoad for an error
// status document load (only a network-level failure fires onError), so
// the frontend's own "Tracker indisponível" fallback UI never gets a
// chance to show — the raw error text renders instead, looking broken
// rather than intentional. This gives the iframe something that matches
// the same look on failure regardless of which layer caught it.
function trackerUnavailableHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:rgba(12,22,33,1);color:rgba(228,228,231,1);
    font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  .wrap{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;}
  .msg{font-size:13px;font-weight:600;color:rgba(244,244,245,1);}
</style></head>
<body><div class="wrap"><div class="msg">Tracker indisponível neste momento.</div></div></body></html>`;
}

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
        finalStatscoreEventId: null,
        usedFallbackSmartBetbyId: false,
      });
    }
    const finalBetbyEventId = resolved.finalBetbyEventId!;
    const explicitStatscoreId = typeof req.query.statscoreEventId === "string" && req.query.statscoreEventId.length >= 4
      ? req.query.statscoreEventId.trim()
      : null;
    const homeForResolve = typeof req.query.home === "string" ? req.query.home.trim() : "";
    const awayForResolve = typeof req.query.away === "string" ? req.query.away.trim() : "";
    let finalStatscoreEventId: string | null = explicitStatscoreId;
    let usedFallbackSmartBetbyId = false;
    if (!finalStatscoreEventId) {
      try {
        finalStatscoreEventId = await Promise.race([
          resolveStatscoreEventIdFromBetby(finalBetbyEventId, 5000),
          new Promise<null>((ok) => setTimeout(() => ok(null), 5600)),
        ]) as string | null;
      } catch (_) { finalStatscoreEventId = null; }
    }
    // Bug found 2026-08-14 auditing every BetBY URL config end-to-end: this
    // route bakes finalStatscoreEventId into the proxy URL it returns, and
    // once that URL is built with SOME value (real or the wrong-ID
    // fallback below), fetchBetbyTrackerHtml's "SHORTCUT PRIORIDADE 0"
    // treats whatever arrives on the query string as already-resolved and
    // never re-checks anything — including tryManualTeamStatscoreId (the
    // Mirassol/LDU hand-mapped override). Since THIS route never consulted
    // that table itself, a match covered by the manual map but not by
    // automatic resolution had its correct ID silently overridden by the
    // wrong-ID fallback below before the manual map ever got a chance to
    // run — making that override effectively dead code for any request
    // that goes through the normal /url → <iframe src> flow (which is all
    // of them). Checking it here, in the same priority slot
    // fetchBetbyTrackerHtml itself uses, is what actually makes it apply.
    if (!finalStatscoreEventId && (homeForResolve || awayForResolve)) {
      finalStatscoreEventId = tryManualTeamStatscoreId(homeForResolve, awayForResolve);
    }
    if (!finalStatscoreEventId) {
      finalStatscoreEventId = finalBetbyEventId;
      usedFallbackSmartBetbyId = true;
    }
    const publicDirectUrl = buildBetbyTrackerPublicUrl({
      betbyEventId: finalBetbyEventId,
      statscoreEventId: finalStatscoreEventId ?? undefined,
      lang,
      sportId,
    });
    const apiBase = `${req.protocol}://${req.get("host") ?? ""}`;
    let proxyUrl = `${apiBase}/api/betby-live-tracker/${encodeURIComponent(finalBetbyEventId)}?lang=${encodeURIComponent(lang)}&sportId=${encodeURIComponent(sportId)}`;
    if (finalStatscoreEventId) proxyUrl += `&statscoreEventId=${encodeURIComponent(finalStatscoreEventId)}`;
    const rawHome = typeof req.query.home === "string" ? req.query.home : "";
    const rawAway = typeof req.query.away === "string" ? req.query.away : "";
    if (rawHome) proxyUrl += `&home=${encodeURIComponent(rawHome)}`;
    if (rawAway) proxyUrl += `&away=${encodeURIComponent(rawAway)}`;
    void resolveBetbyMatchMeta(finalBetbyEventId, 3500).catch(() => null);
    return res.status(200).json({
      ok: true,
      finalBetbyEventId,
      finalStatscoreEventId,
      usedFallbackSmartBetbyId,
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
      finalStatscoreEventId: null,
      usedFallbackSmartBetbyId: false,
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
  const explicitStatscoreId = typeof req.query.statscoreEventId === "string" && req.query.statscoreEventId.length >= 4
    ? req.query.statscoreEventId.trim()
    : null;
  let finalBetbyEventId: string | null = null;
  try {
    const queryHome = typeof req.query.home === "string" ? req.query.home.trim() : "";
    const queryAway = typeof req.query.away === "string" ? req.query.away.trim() : "";
    const resolved = await resolveFinalBetbyEventId(req);
    if (resolved.error) {
      return res
        .status(200)
        .type("text/plain")
        .send(resolved.error.msg);
    }
    finalBetbyEventId = resolved.finalBetbyEventId!;

    const parentOrigin = getOriginFromRequest(req) ?? "*";
    const meta = await resolveBetbyMatchMeta(finalBetbyEventId, 3500)
      .catch(() => null);
    const upstreamPreview = buildBetbyTrackerUpstreamUrl({
      betbyEventId: finalBetbyEventId,
      statscoreEventId: explicitStatscoreId ?? undefined,
      lang,
      sportId,
    });
    const { html, upstreamUrl } = await fetchBetbyTrackerHtml({
      betbyEventId: finalBetbyEventId,
      statscoreEventId: explicitStatscoreId ?? undefined,
      homeTeamName: meta?.homeName || queryHome || undefined,
      awayTeamName: meta?.awayName || queryAway || undefined,
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
    logger.warn({ err: msg }, "[betbyTracker] / handler failed");
    if (explicitStatscoreId && finalBetbyEventId) {
      try {
        const u = buildBetbyTrackerUpstreamUrl({ betbyEventId: finalBetbyEventId, statscoreEventId: explicitStatscoreId, lang, sportId });
        res.set(BETBY_TRACKER_RESPONSE_HEADERS);
        return res.status(200).type("text/html").send(buildClientRedirectBypassWafHtml(u, DEFAULT_THEME));
      } catch (_) {}
    }
    return res.status(200).type("text/html").send(trackerUnavailableHtml());
  }
});

router.get("/:betbyEventId", async (req: Request, res: Response) => {
  const betbyEventId = String(req.params.betbyEventId);
  const lang = typeof req.query.lang === "string" && req.query.lang.length > 0
    ? req.query.lang
    : "pt-br";
  const sportId = typeof req.query.sportId === "string" && req.query.sportId.length > 0
    ? req.query.sportId
    : "1";
  const explicitStatscoreId = typeof req.query.statscoreEventId === "string" && req.query.statscoreEventId.length >= 4
    ? req.query.statscoreEventId.trim()
    : null;
  try {
    if (!betbyEventId || betbyEventId.length < 6 || !/^\d+$/.test(betbyEventId)) {
      return res.status(200).type("text/plain").send("Invalid betbyEventId (expected numeric id)");
    }
    const queryHome = typeof req.query.home === "string" ? req.query.home.trim() : "";
    const queryAway = typeof req.query.away === "string" ? req.query.away.trim() : "";
    const parentOrigin = getOriginFromRequest(req) ?? "*";

    const meta = await resolveBetbyMatchMeta(betbyEventId, 3500).catch(() => null);

    const upstreamPreview = buildBetbyTrackerUpstreamUrl({
      betbyEventId,
      statscoreEventId: explicitStatscoreId ?? undefined,
      lang,
      sportId,
    });

    const { html, upstreamUrl } = await fetchBetbyTrackerHtml({
      betbyEventId,
      statscoreEventId: explicitStatscoreId ?? undefined,
      homeTeamName: meta?.homeName || queryHome || undefined,
      awayTeamName: meta?.awayName || queryAway || undefined,
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
    logger.warn({ err: msg, betbyEventId: req.params.betbyEventId }, "[betbyTracker] fetchBetbyTrackerHtml failed");
    if (explicitStatscoreId && betbyEventId && /^\d+$/.test(betbyEventId) && betbyEventId.length >= 6) {
      try {
        const u = buildBetbyTrackerUpstreamUrl({ betbyEventId, statscoreEventId: explicitStatscoreId, lang, sportId });
        res.set(BETBY_TRACKER_RESPONSE_HEADERS);
        return res.status(200).type("text/html").send(buildClientRedirectBypassWafHtml(u, DEFAULT_THEME));
      } catch (_) {}
    }
    return res.status(200).type("text/html").send(trackerUnavailableHtml());
  }
});

export default router;
