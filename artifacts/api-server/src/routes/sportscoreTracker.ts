import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import { autoResolveSportscoreMapping } from "../services/sportscore/autoMap.js";
import { buildSportscoreEmbedUrl } from "../services/sportscore/client.js";

const router = Router();

// Public, no-auth: the live Tracker UI calls this itself (see
// BetbyTrackerIframe in home.tsx) to try automatic SportScore resolution —
// real match data, no admin action needed — before falling back to the
// "indisponível" state. Same resolver + auto-persist into
// sportscore_match_map as the admin test route uses, so a match resolved
// once here is instant for every other viewer of the same match afterwards.
router.get("/url", async (req: Request, res: Response) => {
  const sport = typeof req.query.sport === "string" ? req.query.sport.trim().toLowerCase() : "football";
  const home = typeof req.query.home === "string" ? req.query.home.trim() : "";
  const away = typeof req.query.away === "string" ? req.query.away.trim() : "";
  const statpalMatchId = typeof req.query.matchId === "string" ? req.query.matchId.trim() : "";
  if (!home || !away || !statpalMatchId) {
    res.json({ ok: false, embedUrl: null });
    return;
  }
  try {
    const row = await autoResolveSportscoreMapping(sport, statpalMatchId, home, away);
    if (!row) {
      res.json({ ok: false, embedUrl: null });
      return;
    }
    res.json({ ok: true, embedUrl: buildSportscoreEmbedUrl(sport, row.sportscoreId) });
  } catch (err) {
    logger.warn({ err, sport, home, away }, "[sportscore] sportscore-tracker/url failed");
    res.json({ ok: false, embedUrl: null });
  }
});

export default router;
