import { Router, type IRouter, type Request, type Response } from "express";
import { resolveVideoInfo } from "../services/smytdryt/resolver.js";
import { buildStreamUrl } from "../services/smytdryt/stream.js";

const router: IRouter = Router();

// BET62 Live streaming — SMYTDRYT (HLS stream) resolved against the manual
// admin mapping table (services/liveStream/mapping.ts). Match Tracker itself
// (score/minute/incidents) is served from /api/matches — see
// resolveDirectTracker/attachDirectTracker in routes/matches.ts.

router.get("/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  try {
    const video = await resolveVideoInfo(id);
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
