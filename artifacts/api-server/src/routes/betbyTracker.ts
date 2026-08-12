import { Router, type Request, type Response } from "express";
import {
  BETBY_TRACKER_RESPONSE_HEADERS,
  fetchBetbyTrackerHtml,
  buildBetbyTrackerUpstreamUrl,
  type BetbyThemeInjection,
} from "../services/betbyTracker/proxy.js";
import { listMappings } from "../services/liveStream/mapping.js";
import { teamNamesMatch } from "../services/pulsescore/teamMatch.js";
import {
  resolveBetbyMatchMeta,
} from "../services/betbyTracker/pulseBridge.js";
import { logger } from "../lib/logger.js";

const router = Router();

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

/** Encontra um betbyEventId na tabela live_stream_mappings por nomes times
 *  (fuzzy match teamNamesMatch). Retorna null se não encontrar nenhum candidato
 *  aceitável — neste caso pode chamar listBetbyLiveEventsByBrand no futuro. */
async function resolveBetbyEventIdByName(
  home: string,
  away: string,
): Promise<{ betbyEventId: string; confidence: number } | null> {
  if (!home || !away) return null;
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

router.get("/", async (req: Request, res: Response) => {
  const home = typeof req.query.home === "string" ? req.query.home.trim() : "";
  const away = typeof req.query.away === "string" ? req.query.away.trim() : "";
  const betbyEventId = typeof req.query.betbyEventId === "string"
    ? req.query.betbyEventId.trim()
    : "";
  const lang = typeof req.query.lang === "string" && req.query.lang.length > 0
    ? req.query.lang
    : "pt-br";
  const sportId = typeof req.query.sportId === "string" && req.query.sportId.length > 0
    ? req.query.sportId
    : "1";
  let finalBetbyEventId = betbyEventId;

  if (!finalBetbyEventId) {
    if (!home || !away) {
      return res
        .status(400)
        .type("text/plain")
        .send("Missing required query params: betbyEventId OR (home AND away)");
    }
    const byName = await resolveBetbyEventIdByName(home, away);
    if (!byName) {
      return res
        .status(404)
        .type("text/plain")
        .send(`No BetBY match mapping found for "${home}" vs "${away}".`);
    }
    finalBetbyEventId = byName.betbyEventId;
  }

  if (!finalBetbyEventId || finalBetbyEventId.length < 6 || !/^\d+$/.test(finalBetbyEventId)) {
    return res.status(400).type("text/plain").send("Invalid betbyEventId (expected numeric id)");
  }

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
