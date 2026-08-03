import { Router, type IRouter, type Request, type Response } from "express";
import {
  findBetbyEvent,
  getAllEvents,
  getFeedDoc,
  findEventById,
  getLastReload,
  type BetbyLiveEvent,
} from "../services/betby/liveFeed.js";
import {
  refreshPublicBetbyFeed,
  getCachedFeed as getBetbyPublicCached,
  getAllBetbyEventsAsMatches,
  getLastRefreshMs as getBetbyPublicLastRefresh,
} from "../services/betby/publicScraperWithMapper.js";
import { logger } from "../lib/logger.js";
import {
  betbyWsService,
  betbyBridgeStore,
  betbyBridgeTake,
  type BetbyWsState,
} from "../services/betby/betbyWsService.js";
import { betbyJwt } from "../services/betby/jwtService.js";
import { adminMiddleware, type AdminRequest } from "../middlewares/adminAuth.js";

const router: IRouter = Router();

/**
 * GET /betby/live
 * Retorna todos os 450+ eventos BETBY LIVE no feed atual (inclui virtuais,
 * stream broadcasts e widgets). Esse endpoint é a fonte primária do frontend
 * para buscar a lista de jogos que a BetBY está cobrindo LIVE.
 */
router.get("/betby/live", (_req: Request, res: Response) => {
  const doc = getFeedDoc();
  res.json({
    ok: true,
    generated: doc.generated,
    source: doc.source,
    stats: doc.stats,
    lastReload: getLastReload(),
    events: doc.events,
  });
});

/**
 * GET /betby/live/footbal
 * Apenas eventos de FUTEBOL (sport.id==1 e virtual=false) — os jogos que
 * cobrem a maior parte dos jogos do Bet62 Brasileiro/Colombiano/Mexicano.
 */
router.get("/betby/live/football", (_req: Request, res: Response) => {
  const evs = getAllEvents().filter(
    (e) => !e.virtual && (e.sport.id === "1" || /soccer|football/i.test(e.sport.name ?? "")),
  );
  res.json({ ok: true, count: evs.length, events: evs });
});

/**
 * GET /betby/live/streams
 * Apenas eventos que TEM broadcasts iframe (stream) — seja SMD, Twitch,
 * BetGenius, vpplayer.tech, etc. São os 30-40 jogos que tem vídeo ao vivo.
 */
router.get("/betby/live/streams", (_req: Request, res: Response) => {
  const evs = getAllEvents().filter(
    (e) => Array.isArray(e.broadcasts) && e.broadcasts.length > 0,
  );
  res.json({ ok: true, count: evs.length, events: evs });
});

/**
 * GET /betby/event/:id
 * Detalhe de um evento BETBY por ID (o ID decimal longo tipo 2693293514493661232).
 */
router.get("/betby/event/:id", (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  const ev = findEventById(id);
  if (!ev) {
    res.status(404).json({ ok: false, error: "event_not_found", id });
    return;
  }
  res.json({ ok: true, event: ev });
});

/**
 * GET /betby/search?home=Am%C3%A9rica%20de%20Cali&away=Atl%C3%A9tico%20Huila&tournament=Primera%20A&sport=football
 * Fuzzy match de um jogo do Bet62 contra a lista BetBY. Retorna top 3 matches
 * por ordem de similaridade (Jaccard sobre tokens, com swap ordem home/away).
 *
 * Parâmetros:
 *   home, away   — obrigatórios, nomes dos dois times
 *   tournament   — opcional: nome campeonato (liga/país/torneio)
 *   sport        — opcional: football | basketball | tennis | baseball | hockey
 *   minScore     — opcional: threshold mínimo 0..1 (default 0.25)
 *   topN         — opcional: quantos retornar (default 3)
 */
router.get("/betby/search", (req: Request, res: Response) => {
  const home = String(req.query.home ?? "").trim();
  const away = String(req.query.away ?? "").trim();
  if (!home || !away) {
    res.status(400).json({ ok: false, error: "home_and_away_required" });
    return;
  }
  const tournament = String(req.query.tournament ?? "").trim() || undefined;
  const sportRaw = String(req.query.sport ?? "").trim() || undefined;
  const sport =
    sportRaw === "football" ||
    sportRaw === "basketball" ||
    sportRaw === "tennis" ||
    sportRaw === "baseball" ||
    sportRaw === "hockey"
      ? sportRaw
      : null;
  const minScore = Number(req.query.minScore ?? NaN);
  const topN = Number(req.query.topN ?? NaN);
  try {
    const matches = findBetbyEvent({
      home,
      away,
      tournament,
      sport,
      minScore: Number.isFinite(minScore) && minScore > 0 ? minScore : undefined,
      topN: Number.isFinite(topN) && topN > 0 ? Math.round(topN) : undefined,
    });
    const mapped = matches.map((m) => ({
      score: m.score,
      label: m.label,
      home_sim: m.homeScore,
      away_sim: m.awayScore,
      tournament_sim: m.tournamentScore,
      swapped: m.swapped,
      event: m.event,
    }));
    res.json({
      ok: true,
      query: { home, away, tournament, sport },
      count: mapped.length,
      matches: mapped,
    });
  } catch (err) {
    logger.error({ err, q: { home, away, tournament } }, "[betby-api] search falhou");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ────────────────────────────────────────────────────────────────────────
//  SCRAPING PÚBLICO BETBY V4 (fonte principal) — ENDPOINTS DE DEBUG ADMIN
// ────────────────────────────────────────────────────────────────────────

/**
 * GET /betby/public-feed
 * Retorna o DOCUMENTO RAW do scraper público BetBY (manifest → chunks →
 * auth_side) completo com stats + eventos (raw BetBYEvent + broadcasts/widgets).
 * Ideal para validar se o scraper está rodando e com quantos eventos/streams.
 */
router.get("/betby/public-feed", async (_req: Request, res: Response) => {
  const cached = getBetbyPublicCached();
  if (!cached) {
    // Boot frio: força refresh neste request (demora ~2-3s no primeiro acesso)
    const fresh = await refreshPublicBetbyFeed();
    return res.json({ ok: !!fresh, boot_warmup: true, doc: fresh ?? null });
  }
  res.json({ ok: true, lastRefreshMs: getBetbyPublicLastRefresh(), doc: cached });
});

/**
 * GET /betby/public-feed/matches-mapped
 * Retorna a lista BetBY JÁ MAPEADA para o schema Bet62 Match, exatamente
 * como o frontend vai receber no /api/live. Ideal para testar o mapper
 * sem precisar ligar o servidor todo.
 *
 * Query params:
 *   onlyLive=1   | 0  default = só live + próximos prematch
 *   onlyReal=1   | 1  default = sem virtuais
 *   hasStream=1  | 0  só eventos com broadcasts iframe
 *   sport=football | basketball | tennis | ...
 *   limit=50         limita a quantidade
 */
router.get("/betby/public-feed/matches-mapped", (_req: Request, res: Response) => {
  const q = _req.query as Record<string, string>;
  const matches = getAllBetbyEventsAsMatches({
    onlyLive: q.onlyLive === "1",
    onlyReal: q.onlyReal !== "0",
    hasStream: q.hasStream === "1",
    sport: q.sport as any,
  });
  const limit = Number(q.limit ?? NaN);
  const out = Number.isFinite(limit) && limit > 0 ? matches.slice(0, limit) : matches;
  res.json({
    ok: true,
    count: out.length,
    lastRefreshMs: getBetbyPublicLastRefresh(),
    matches: out,
  });
});

/**
 * POST /betby/public-feed/refresh
 * Força um refresh IMEDIATO do scraper público (ignora intervalo de 20s).
 * Rápido retorno assíncrono (não espera a conclusão, mas inicia refresh).
 * Admin usa após mudanças de config.
 */
router.post("/betby/public-feed/refresh", async (_req: Request, res: Response) => {
  const resultP = refreshPublicBetbyFeed();
  void resultP.then((fresh) => {
    logger.info(
      { eventCount: fresh?.events.length ?? 0, ok: !!fresh },
      "[betby-public] refresh manual concluído",
    );
  });
  res.json({ ok: true, started: true, lastRefreshMsBefore: getBetbyPublicLastRefresh() });
});

// ────────────────────────────────────────────────────────────────────────
//  BETBY WEBSOCKET: LIVE TRACKER (play-by-play) + STREAM HLS (.m3u8)
//
//  Modos:
//    • browser_renderer (PADRÃO): usa BTRenderer.action() do renderer
//      BetBY carregado no Integrated Browser (ou iframe frontend).
//      Quando WS Node bloqueado por Cloudflare, retorna TICKET bridge —
//      cliente Integrated Browser envia resultado de volta via /bridge-result.
//
//    • ws_nativo (BETBY_WS_MODE=ws_nativo): conecta /api/v1/ws_new direto
//      (funciona só em ambientes sem bloqueio Cloudflare na saída Node).
// ────────────────────────────────────────────────────────────────────────

/**
 * GET /betby/ws/estado
 * Estado do service BetbyWsService: status, host, modo, msgs, requests pendentes.
 */
router.get("/betby/ws/estado", (_req: Request, res: Response) => {
  res.json({ ok: true, state: betbyWsService.getEstado() });
});

/**
 * POST /betby/ws/modo?modo=browser_renderer|ws_nativo
 * Alterna runtime entre os dois modos.
 */
router.post("/betby/ws/modo", (req: Request, res: Response) => {
  const modo = String((req.query.modo || (req.body && req.body.modo) || "browser_renderer")).trim();
  if (modo !== "browser_renderer" && modo !== "ws_nativo") {
    res.status(400).json({ ok: false, error: "modo_invalido", esperado: "browser_renderer | ws_nativo" });
    return;
  }
  betbyWsService.setModo(modo);
  res.json({ ok: true, modo, state: betbyWsService.getEstado() });
});

/**
 * POST /betby/ws/connect?hostWs=ff7828db6a5af99c.hdonegame.com
 * Força conexão WS (ws_nativo) ou abre conexão virtual (browser_renderer).
 */
router.post("/betby/ws/connect", async (req: Request, res: Response) => {
  const hostWs = String((req.query.hostWs || (req.body && req.body.hostWs) || "")).trim() || undefined;
  const timeoutMs = Number(req.query.timeoutMs || (req.body && req.body.timeoutMs) || 14_000);
  try {
    await betbyWsService.connectIfNeeded(hostWs, timeoutMs);
    res.json({ ok: true, state: betbyWsService.getEstado() });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: "connect_failed",
      message: String(e).slice(0, 500),
      state: betbyWsService.getEstado(),
    });
  }
});

/**
 * POST /betby/ws/disconnect
 */
router.post("/betby/ws/disconnect", async (_req: Request, res: Response) => {
  await betbyWsService.disconnect();
  res.json({ ok: true, state: betbyWsService.getEstado() });
});

/**
 * GET /betby/ws/tracker/:eventId
 *   Retorna get_match_tracker da BetBY para o evento (play-by-play, gols,
 *   cartões, posse, escanteios, timeline completa).
 *
 *   Query params:
 *     timeoutMs=18000  (tempo máximo de espera)
 *     checkBridge=1    (se existir resultado de bridge para o mesmo ticket, retorna)
 */
router.get("/betby/ws/tracker/:eventId", async (req: Request, res: Response) => {
  const eventId = String(req.params.eventId || "").trim();
  if (!/^\d+$/.test(eventId) || eventId.length < 8) {
    res.status(400).json({ ok: false, error: "eventId_invalido (deve ser ID decimal BetBY longo)" });
    return;
  }
  const timeoutMs = Number(req.query.timeoutMs || 18_000);
  try {
    await betbyWsService.connectIfNeeded();
    const ticket = String(req.query.checkBridge || "").trim();
    if (ticket) {
      const cached = betbyBridgeTake(ticket);
      if (cached) {
        res.json({ ok: true, source: "bridge_cache", eventId, result: cached });
        return;
      }
    }
    const r = await betbyWsService.getMatchTracker(eventId, timeoutMs);
    res.json({
      ok: true,
      source: betbyWsService.modo(),
      eventId,
      result: r,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: "tracker_failed",
      message: String(e).slice(0, 500),
      state: betbyWsService.getEstado(),
    });
  }
});

/**
 * GET /betby/ws/stream/:eventId
 *   Retorna get_stream da BetBY para o evento (URL HLS real .m3u8 smytdryt.live,
 *   playbackUrl, iframe, auth token do stream, etc).
 */
router.get("/betby/ws/stream/:eventId", async (req: Request, res: Response) => {
  const eventId = String(req.params.eventId || "").trim();
  if (!/^\d+$/.test(eventId) || eventId.length < 8) {
    res.status(400).json({ ok: false, error: "eventId_invalido (deve ser ID decimal BetBY longo)" });
    return;
  }
  const timeoutMs = Number(req.query.timeoutMs || 18_000);
  try {
    await betbyWsService.connectIfNeeded();
    const ticket = String(req.query.checkBridge || "").trim();
    if (ticket) {
      const cached = betbyBridgeTake(ticket);
      if (cached) {
        res.json({ ok: true, source: "bridge_cache", eventId, result: cached });
        return;
      }
    }
    const r = await betbyWsService.getStream(eventId, timeoutMs);
    res.json({
      ok: true,
      source: betbyWsService.modo(),
      eventId,
      result: r,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: "stream_failed",
      message: String(e).slice(0, 500),
      state: betbyWsService.getEstado(),
    });
  }
});

/**
 * GET /betby/ws/jwt-status
 *   Estado atual do JWT usado pelo betbyWsService (validade, flags, horas
 *   restantes) — admin only, não expõe o token em si.
 */
router.get(
  "/betby/ws/jwt-status",
  adminMiddleware,
  (_req: AdminRequest, res: Response) => {
    const snap = betbyJwt.snapshot();
    res.json({
      ok: true,
      hasToken: !!snap.token,
      payload: snap.payload
        ? { iss: snap.payload.iss, sub: snap.payload.sub, lang: snap.payload.lang, ff: snap.payload.ff }
        : null,
      issuedAt: snap.issuedAt,
      expiresAt: snap.expiresAt,
      hoursLeft: snap.hoursLeft,
      needsRefresh: snap.needsRefresh,
      hasMatchTrackerFlag: snap.hasMatchTrackerFlag,
      hasCashoutFlag: snap.hasCashoutFlag,
    });
  },
);

/**
 * POST /betby/ws/jwt
 *   Instala um JWT capturado manualmente do navegador (sessão BetBY real) —
 *   admin only. Substitui o token atual sem precisar de redeploy; expira em
 *   ~24-48h e precisa ser recolado quando o GET /jwt-status indicar
 *   needsRefresh: true.
 *
 *   Body JSON: { token: "eyJ..." }
 */
router.post(
  "/betby/ws/jwt",
  adminMiddleware,
  (req: AdminRequest, res: Response) => {
    const token = String((req.body && req.body.token) || "").trim();
    if (!token) {
      res.status(400).json({ ok: false, error: "token_obrigatorio" });
      return;
    }
    const snap = betbyJwt.setToken(token, "admin-endpoint");
    if (!snap.token) {
      res.status(400).json({ ok: false, error: "token_invalido_nao_decodificou_como_jwt" });
      return;
    }
    res.json({
      ok: true,
      installed: true,
      hoursLeft: snap.hoursLeft,
      hasMatchTrackerFlag: snap.hasMatchTrackerFlag,
      hasCashoutFlag: snap.hasCashoutFlag,
    });
  },
);

/**
 * POST /betby/ws/bridge-result
 *   Quando cliente browser renderer executa btInstance.action() (Integrated
 *   Browser), ele envia o resultado real para esta rota (HTTP POST).
 *   Service armazena em cache temporário — próximo GET /tracker ou /stream
 *   com ?checkBridge=TICKET retorna a resposta real sem precisar WS Node.
 *
 *   Body JSON:
 *     { ticket: "tk_get_match_tracker_...", result: {...} }
 */
router.post("/betby/ws/bridge-result", (req: Request, res: Response) => {
  const body = (req.body && typeof req.body === "object" ? req.body : null) || null;
  const ticket = String(body?.ticket || "").trim();
  const result = body?.result ?? null;
  const ttlMs = Number(body?.ttlMs || (5 * 60 * 1000));
  if (!ticket || result === null || result === undefined) {
    res.status(400).json({ ok: false, error: "campos_obrigatorios", esperado: "ticket + result" });
    return;
  }
  betbyBridgeStore(ticket, result, ttlMs);
  res.json({ ok: true, armazenado: true, ticket, ttlMs });
});

export default router;
export type { BetbyLiveEvent };
