import { Router, type IRouter } from "express";
import { z } from "zod";
import { CONFIG } from "../lib/config.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const HealthCheckSchema = z.object({ status: z.string() });
  const data = HealthCheckSchema.parse({ status: "ok" });
  res.json(data);
});

// Plain, unvalidated debug route (not part of the generated api-zod
// contract) — lets a deploy be verified by visiting this URL directly,
// instead of relying on Railway's UI, which was the ambiguous step behind
// several rounds of "is the fix even deployed?" debugging (2026-08-29).
// RAILWAY_GIT_COMMIT_SHA is auto-injected by Railway on every deploy.
router.get("/version", (_req, res) => {
  res.json({ commit: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? null });
});

// Estado dos providers esportivos: flags kill-switch + último fetch com
// sucesso por fornecedor. Útil para diagnosticar se SportMonks/PulseScore
// estão realmente SUSPENSOS (sem 1 rede) após deploy.
// Rota não validada (mesmo espírito que /version) para não tocar no
// contrato zod gerado por orval.
router.get("/health-data-providers", (_req, res) => {
  const g = globalThis as any;
  res.json({
    flags: {
      ENABLE_SPORTMONKS: CONFIG.ENABLE_SPORTMONKS,
      ENABLE_PULSESCORE: CONFIG.ENABLE_PULSESCORE,
    },
    keys: {
      SPORTMONKS_API_KEY_SET: CONFIG.SPORTMONKS_API_KEY.length > 0,
      PULSESCORE_API_KEY_SET: CONFIG.PULSESCORE_API_KEY.length > 0,
    },
    lastSuccessfulFetch: {
      sportmonks: g.__lastFetchTs?.sportmonks ?? null,
      pulsescore: g.__lastFetchTs?.pulsescore ?? null,
    },
    providerQualityDebug: g.__providerQualityDebug ?? null,
    livePayloadDebug: g.__livePayloadDebug ?? null,
  });
});

router.get("/debug-provider-quality", (_req, res) => {
  const g = globalThis as any;
  res.json({
    updatedAt: g.__providerQualityDebug?.updatedAt ?? null,
    upcoming: g.__providerQualityDebug?.upcoming ?? {},
    live: g.__providerQualityDebug?.live ?? {},
    livePayload: g.__livePayloadDebug ?? null,
  });
});

export default router;
