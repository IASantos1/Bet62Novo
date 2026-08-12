import { Router, type Request, type Response } from "express";
import { getMapping } from "../services/liveStream/mapping.js";
import {
  buildStatscoreTrackerHtml,
  STATSC_TRACKER_HEADERS,
  type Bet62ThemeVars,
} from "../services/statscore/trackerHtml.js";

const router = Router();

const DEFAULT_THEME: Bet62ThemeVars = {
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

router.get("/:betbyEventId", async (req: Request, res: Response) => {
  try {
    const betbyEventId = String(req.params.betbyEventId);
    if (!betbyEventId || betbyEventId.length < 6) {
      return res.status(400).type("text/plain").send("Invalid betbyEventId");
    }

    const row = await getMapping(betbyEventId);
    if (!row) {
      return res.status(404).type("text/plain").send("Live stream mapping not found for this event");
    }
    if (row.statscoreEventId == null || row.statscoreEventId <= 0) {
      return res
        .status(404)
        .type("text/plain")
        .send("StatScore event not mapped yet for this match — admin must set statscoreEventId");
    }

    const lang = typeof req.query.lang === "string" && req.query.lang.length > 0
      ? req.query.lang
      : "pt-br";

    const html = buildStatscoreTrackerHtml({
      statscoreEventId: row.statscoreEventId,
      language: lang,
      isLive: true,
      theme: DEFAULT_THEME,
      parentOrigin: getOriginFromRequest(req) ?? "*",
    });

    res.set(STATSC_TRACKER_HEADERS);
    return res.status(200).send(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).type("text/plain").send(`Failed to serve tracker: ${msg}`);
  }
});

export default router;
