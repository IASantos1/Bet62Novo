import { CONFIG } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { fetchBetbyLiveEvents, getCachedExtractedVideo } from "./client.js";
import { setLiveEvents, hydrateLiveEventsFromRedis } from "./state.js";
import { ensureMapping, applyAutoExtractedVideo } from "../liveStream/mapping.js";
import { getPulseScoreTrackerForTeams } from "../pulsescore/betbyTracker.js";
import { getStatpalTrackerForTeams } from "../statpal/liveTracker.js";
import { resolveStatscoreEventId } from "../statscore/resolver.js";
import { getStatscoreTracker } from "../statscore/tracker.js";
import { resolveVideoInfo } from "../smytdryt/resolver.js";
import { buildStreamUrl } from "../smytdryt/stream.js";
import type { LiveEvent } from "./types.js";
import type { MatchTracker } from "../liveStream/trackerTypes.js";

// Resolução de Match Tracker em 3 CAMADAS — híbrido: Statpal é a fonte mais
// rica para futebol (play-by-play, incidentes reais) e continua na cascata
// (bug do 429/fallback já corrigido); PulseScore cobre tudo que a Statpal
// não cobre (outros esportes) e serve de rede de segurança se as duas
// primeiras falharem para um evento específico.
//   1. StatScore — placar/minuto/incidentes AO VIVO.
//      • Payload mais rico (minute, status, home/away score, incidents feed completo).
//      • AUTENTICAÇÃO: header X-Auth + Referer widgets.statscore.com + query ?auth= (compat).
//      • Requer mapeamento MANUAL admin (live_stream_mappings.statscore_event_id).
//   2. Statpal — estatísticas/eventos. **FUTEBOL APENAS**.
//      • Play-by-play, cruza por nome de time (ZERO trabalho manual).
//      • Cota: 300k/dia → cache rigoroso, polling nunca mais rápido que ~15s.
//   3. PulseScore — Odds/Mercados, usada também como fallback automático de tracker.
//      • Como TRACKER (fallback): best-effort scoreboard only (documentado schema garante só `score`;
//        minute/clock/incidents se existirem no payload da casa são usados, senão vazios).
//      • Cota ilimitada. WebSocket para tênis, REST para demais esportes (incl. futebol).
// Cada tier trata seus próprios erros — nunca deixe falha transitória de um provedor
// derrubar todo o lote (Promise.all() design no tick() abaixo).
async function resolveTracker(event: LiveEvent): Promise<MatchTracker | null> {
  const statscoreEventId = await resolveStatscoreEventId(event.betbyEventId).catch(() => null);
  if (statscoreEventId != null) {
    try {
      return await getStatscoreTracker(statscoreEventId);
    } catch (err) {
      logger.error(
        { err, betbyEventId: event.betbyEventId, statscoreEventId },
        "[betby-poller] StatScore tracker fetch failed, falling back to Statpal",
      );
    }
  }

  const s = (event.sport || "").toLowerCase();
  const statpalEligible = s.includes("soccer") || s.includes("football");
  if (statpalEligible) {
    try {
      const tr = await getStatpalTrackerForTeams(event.home, event.away);
      if (tr) return tr;
    } catch (err) {
      logger.error(
        { err, betbyEventId: event.betbyEventId },
        "[betby-poller] Statpal tracker fetch failed, falling back to PulseScore",
      );
    }
  }

  try {
    return await getPulseScoreTrackerForTeams(event.home, event.away, event.sport);
  } catch (err) {
    // Must not throw here: this runs inside Promise.all() over every live
    // event in tick() below — an uncaught rejection from one event's
    // PulseScore lookup would fail the whole batch and stall /api/live for
    // every other event too.
    logger.error(
      { err, betbyEventId: event.betbyEventId },
      "[betby-poller] PulseScore tracker (odds-overlay fallback) fetch failed",
    );
    return null;
  }
}

let pollTimer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  let events: LiveEvent[];
  try {
    events = await fetchBetbyLiveEvents();
  } catch (err) {
    logger.error({ err }, "[betby-poller] fetch failed");
    return;
  }
  if (events.length === 0) return;

  // Seed/refresh the mapping table for every live event seen (cheap upsert,
  // never touches admin-set video fields). If the BetBY chunk for this event
  // carried a raw SMYTDRYT playlist URL (deep-scanned in client.ts), try
  // applying it now via applyAutoExtractedVideo() — that helper only writes
  // when the row is still fully auto (no manual videoMatchId/videoKey yet),
  // so an admin's manual work is safe. Then attach whatever's already
  // resolved (tracker via the 3-tier cascade above, stream via either the
  // freshly-applied auto video fields or pre-existing manual ones) so the
  // frontend gets both inline in the same /api/live payload.
  const enriched = await Promise.all(
    events.map(async (event): Promise<LiveEvent> => {
      try {
        await ensureMapping(event);
      } catch (err) {
        logger.error({ err, betbyEventId: event.betbyEventId }, "[betby-poller] ensureMapping failed");
        return event;
      }

      const extracted = getCachedExtractedVideo(event.betbyEventId);
      if (extracted) {
        try {
          await applyAutoExtractedVideo(event.betbyEventId, extracted);
        } catch (err) {
          logger.error(
            { err, betbyEventId: event.betbyEventId },
            "[betby-poller] auto video extraction DB write failed",
          );
        }
      }

      const [tracker, videoInfo] = await Promise.all([
        resolveTracker(event),
        resolveVideoInfo(event.betbyEventId).catch(() => null),
      ]);

      const out: LiveEvent = { ...event };
      if (tracker) {
        out.eventId = tracker.eventId;
        out.tracker = tracker;
      }
      if (videoInfo) {
        out.videoMatchId = videoInfo.matchId;
        out.stream = { hls: buildStreamUrl(videoInfo) };
      }
      return out;
    }),
  );

  setLiveEvents(enriched);
}

export async function startBetbyPoller(): Promise<void> {
  await hydrateLiveEventsFromRedis();
  if (pollTimer) return;
  void tick();
  pollTimer = setInterval(() => void tick(), CONFIG.BETBY_POLL_INTERVAL_MS);
}

export function stopBetbyPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
