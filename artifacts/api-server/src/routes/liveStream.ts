import { Router, type IRouter, type Request, type Response } from "express";
import { getLiveEvents, getLiveEvent } from "../services/betby/state.js";
import { getTrackerForTeams } from "../services/statpal/liveTracker.js";
import { resolveVideoInfo } from "../services/smytdryt/resolver.js";
import { buildStreamUrl } from "../services/smytdryt/stream.js";

const router: IRouter = Router();

// BET62 Live + Match Tracker + Streaming — BetBY (live events) + Statpal
// (Match Tracker, matched by team name — see services/statpal/
// liveTracker.ts's doc comment for why not StatScore) + SMYTDRYT (HLS
// stream), no odds/markets/BetBY iframe. See services/betby/poller.ts for
// how events get here and services/liveStream/mapping.ts for why a
// videoMatchId may be absent on a given event (not yet mapped by an admin).

router.get("/live", (_req: Request, res: Response) => {
  res.json(getLiveEvents());
});

router.get("/tracker/:betbyEventId", (req: Request, res: Response) => {
  const betbyEventId = String(req.params["betbyEventId"]);
  const event = getLiveEvent(betbyEventId);
  if (!event) {
    res.status(404).json({ error: "Evento não encontrado." });
    return;
  }
  const tracker = getTrackerForTeams(event.home, event.away);
  if (!tracker) {
    res.status(404).json({ error: "Tracker indisponível para este evento." });
    return;
  }
  res.json(tracker);
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
