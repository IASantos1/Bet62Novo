import { Router, type Request, type Response } from "express";
import {
  matchBetbyEventToPulseScore,
  resolveBetbyMatchMeta,
  stringifySse,
  type PulseMatchSnapshot,
  type BetbyMatchMeta,
} from "../services/betbyTracker/pulseBridge.js";
import { logger } from "../lib/logger.js";

const router = Router();

function write(res: Response, s: string): boolean {
  try {
    const ok = res.write(s);
    if (typeof res.flushHeaders === "function") {
      try { res.flushHeaders(); } catch (_) { /* ignore */ }
    }
    return ok;
  } catch (_) {
    return false;
  }
}

router.get("/betby/:betbyEventId", async (req: Request, res: Response) => {
  const betbyEventId = String(req.params.betbyEventId || "");
  if (!betbyEventId || betbyEventId.length < 6 || !/^\d+$/.test(betbyEventId)) {
    return res.status(400).type("text/plain").send("Invalid betbyEventId");
  }

  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-cache, must-revalidate, proxy-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Keep-Alive": "timeout=30, max=600",
    Pragma: "no-cache",
    Expires: "0",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  res.status(200).set(headers);
  const connectedAt = Date.now();
  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let metaRef: BetbyMatchMeta | null = null;
  let lastPulseId: string | null = null;
  let lastSentHash = "";
  function hashSnapshot(meta: BetbyMatchMeta | null, m: PulseMatchSnapshot): string {
    return JSON.stringify([meta?.homeName, meta?.awayName, meta?.sportId, m.score, m.minute, m.period, m.running, m.pulseEventId, m.confidence, m.matchedBy]);
  }
  function close() {
    if (closed) return;
    closed = true;
    if (interval) { try { clearInterval(interval); } catch (_) {} interval = null; }
    try { if (!res.headersSent || !res.writableEnded) res.end(); } catch (_) {}
  }
  req.on("close", () => close());
  req.on("aborted", () => close());
  req.socket?.on("close", () => close());
  res.on("close", () => close());
  res.on("finish", () => close());
  res.on("error", () => close());

  // Primeira mensagem: meta + primeiro match (rapidamente)
  try {
    metaRef = await resolveBetbyMatchMeta(betbyEventId, 5200);
    if (metaRef) {
      write(res, stringifySse({ type: "meta", meta: metaRef }));
    }
  } catch (err) {
    logger.warn({ err, betbyEventId }, "[pulseBridge] SSE resolveBetbyMatchMeta failed on bootstrap");
    write(res, stringifySse({ type: "error", message: "Metadados BetBY não disponíveis agora" }));
    metaRef = null;
  }
  try {
    const firstMatch = matchBetbyEventToPulseScore(metaRef, {});
    lastPulseId = firstMatch.pulseEventId;
    lastSentHash = hashSnapshot(metaRef, firstMatch);
    write(res, stringifySse({ type: "match", match: firstMatch }));
  } catch (err) {
    logger.warn({ err, betbyEventId }, "[pulseBridge] SSE initial matchBetbyEventToPulseScore failed");
    write(res, stringifySse({ type: "error", message: "Sincronia PulseScore falhou" }));
  }

  const TICK_MS = 1500;
  const MAX_AGE_WITHOUT_META_MS = 45_000;
  const RE_META_INTERVAL_MS = 60_000;
  let lastMetaResolveAt = Date.now();
  let pingEvery = 0;

  interval = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    try {
      pingEvery = (pingEvery + 1) % 8;
      if (pingEvery === 0) {
        write(res, stringifySse({ type: "ping", ts: now }));
      }
      if (!metaRef && now - connectedAt > MAX_AGE_WITHOUT_META_MS) {
        close();
        return;
      }
      if (!metaRef || now - lastMetaResolveAt >= RE_META_INTERVAL_MS) {
        resolveBetbyMatchMeta(betbyEventId, 3500)
          .then((m) => {
            if (m) {
              const changed = !metaRef || (
                m.homeName !== metaRef.homeName ||
                m.awayName !== metaRef.awayName ||
                m.sportId !== metaRef.sportId
              );
              metaRef = m;
              lastMetaResolveAt = Date.now();
              if (changed) write(res, stringifySse({ type: "meta", meta: m }));
            }
          })
          .catch(() => { /* ignore */ });
      }
      const match = matchBetbyEventToPulseScore(metaRef, lastPulseId ? { candidatePulseEventId: lastPulseId } : undefined);
      if (match.pulseEventId) lastPulseId = match.pulseEventId;
      const h = hashSnapshot(metaRef, match);
      if (h !== lastSentHash) {
        lastSentHash = h;
        write(res, stringifySse({ type: "match", match }));
      }
    } catch (_err) {
      try { write(res, stringifySse({ type: "ping", ts: now })); } catch (_) { close(); }
    }
  }, TICK_MS);

  // 30 minutos máximo de conexão
  setTimeout(() => close(), 30 * 60 * 1000);
});

export default router;
