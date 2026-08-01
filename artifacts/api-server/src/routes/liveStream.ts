import { Router, type IRouter, type Request, type Response } from "express";
import { getLiveEvents, getLiveEvent } from "../services/betby/state.js";
import { resolveVideoInfo } from "../services/smytdryt/resolver.js";
import { buildStreamUrl } from "../services/smytdryt/stream.js";

const router: IRouter = Router();

// BET62 Live + Match Tracker + Streaming — BetBY (live events) + StatScore/
// Statpal (Match Tracker — StatScore when an admin has mapped a
// statscoreEventId, Statpal matched by team name as the automatic fallback
// otherwise, see services/betby/poller.ts's resolveTracker) + SMYTDRYT (HLS
// stream), no odds/markets/BetBY iframe. GET /api/live is the single source
// of truth (tracker/stream embedded inline, refreshed every poll tick);
// /tracker and /stream below just read the same cached state for a
// single-event convenience fetch. See services/liveStream/mapping.ts for
// why a videoMatchId may be absent on a given event (not yet mapped).

router.get("/live", (_req: Request, res: Response) => {
  res.json(getLiveEvents());
});

router.get("/tracker/:betbyEventId", (req: Request, res: Response) => {
  const betbyEventId = String(req.params["betbyEventId"]);
  const event = getLiveEvent(betbyEventId);
  if (!event?.tracker) {
    res.status(404).json({ error: "Tracker indisponível para este evento." });
    return;
  }
  res.json(event.tracker);
});

router.get("/stream/:betbyEventId", async (req: Request, res: Response) => {
  const betbyEventId = String(req.params["betbyEventId"]);
  try {
    const video = await resolveVideoInfo(betbyEventId);
    if (!video) {
      res.status(404).json({ error: "Transmissão ainda não associada a este evento." });
      return;
    }
    res.json({
      provider: "smytdryt",
      matchId: video.matchId,
      url: buildStreamUrl(video),
    });
  } catch (err) {
    res.status(502).json({
      error: "Erro ao obter transmissão.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
