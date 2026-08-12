import { Router, type Request, type Response } from "express";
import {
  BETBY_TRACKER_RESPONSE_HEADERS,
  fetchBetbyTrackerHtml,
  buildBetbyTrackerUpstreamUrl,
  type BetbyThemeInjection,
} from "../services/betbyTracker/proxy.js";

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

router.get("/betby-live-tracker/:betbyEventId", async (req: Request, res: Response) => {
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
