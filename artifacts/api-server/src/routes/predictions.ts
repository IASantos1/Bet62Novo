/**
 * Rota GET /predictions/:matchId
 * Retorna combos publicados para um dado jogo (live ou upcoming).
 * Só futebol — outros esportes retornam [] (mercados incompatíveis).
 */

import { Router, type Request, type Response } from "express";
import { liveMatchState, type LiveMatchState } from "./matches.js";
import { publishCombosForMatch } from "../predictions/engine.js";

const router = Router();

router.get("/:matchId", async (req: Request, res: Response) => {
  const matchId = String(req.params["matchId"] ?? "");
  if (!matchId) {
    res.status(400).json({ error: "matchId obrigatório" });
    return;
  }

  try {
    // 1. Procurar no estado live
    let match: LiveMatchState | undefined = liveMatchState.get(matchId);

    // 2. Se não encontrado no live, tentar upcoming via módulo de matches
    if (!match) {
      // Importar dinamicamente para evitar referência circular ao módulo principal
      const { buildUpcomingMatches } = await import("./matches.js");
      const upcoming = await buildUpcomingMatches();
      const found = upcoming.find((m) => String(m.id) === matchId);
      if (found) {
        // UpcomingMatch tem estrutura compatível para o motor
        match = {
          id: String(found.id),
          home: found.home,
          away: found.away,
          league: found.league,
          country: found.country,
          sport: found.sport ?? "football",
          homeScore: 0,
          awayScore: 0,
          minute: 0,
          status: "upcoming",
          hasRealOdds: found.hasRealOdds,
          odds: found.odds,
          markets: found.markets,
          events: [],
        } as LiveMatchState;
      }
    }

    if (!match) {
      res.json({ combos: [] });
      return;
    }

    // Só futebol tem os mercados necessários
    const sport = (match as any).sport ?? "football";
    if (sport !== "football") {
      res.json({ combos: [] });
      return;
    }

    const combos = publishCombosForMatch({
      odds: match.odds,
      markets: match.markets as any,
    });

    res.json({ combos });
  } catch (err) {
    res.status(500).json({ error: "Erro ao calcular combinações" });
  }
});

export default router;
