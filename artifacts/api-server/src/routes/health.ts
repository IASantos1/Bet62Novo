import { Router, type IRouter } from "express";
import { z } from "zod";
import { CONFIG } from "../lib/config.js";
import { isUpcomingFixtureByStateOrKickoff as gsIsUpcoming } from "../services/goalserve/factory.js";
import {
  getGoalServeFootballUpcomingRaw,
  getGoalServeFootballLiveRaw,
} from "../services/goalserve/football.js";
import { getGoalServeTennisUpcomingRaw, getGoalServeTennisLiveRaw } from "../services/goalserve/tennis.js";
import { getGoalServeBasketballUpcomingRaw, getGoalServeBasketballLiveRaw } from "../services/goalserve/basketball.js";
import { getGoalServeHockeyUpcomingRaw, getGoalServeHockeyLiveRaw } from "../services/goalserve/hockey.js";
import { getGoalServeBaseballUpcomingRaw, getGoalServeBaseballLiveRaw } from "../services/goalserve/baseball.js";
import { getGoalServeVolleyballUpcomingRaw, getGoalServeVolleyballLiveRaw } from "../services/goalserve/volleyball.js";
import { getGoalServeMmaUpcomingRaw, getGoalServeMmaLiveRaw } from "../services/goalserve/mma.js";

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
// sucesso por fornecedor. Útil para confirmar rapidamente se GoalServe é o
// fornecedor ativo, e para diagnosticar se SportMonks/PulseScore estão
// realmente SUSPENSOS (sem 1 rede) após deploy.
// Rota não validada (mesmo espírito que /version) para não tocar no
// contrato zod gerado por orval.
router.get("/health-data-providers", (_req, res) => {
  const g = globalThis as any;
  res.json({
    flags: {
      ENABLE_GOALSERVE: CONFIG.ENABLE_GOALSERVE,
      ENABLE_SPORTMONKS: CONFIG.ENABLE_SPORTMONKS,
      ENABLE_PULSESCORE: CONFIG.ENABLE_PULSESCORE,
    },
    keys: {
      GOALSERVE_API_KEY_SET: CONFIG.GOALSERVE_API_KEY.length > 0,
      SPORTMONKS_API_KEY_SET: CONFIG.SPORTMONKS_API_KEY.length > 0,
      PULSESCORE_API_KEY_SET: CONFIG.PULSESCORE_API_KEY.length > 0,
    },
    lastSuccessfulFetch: {
      goalserve: g.__lastFetchTs?.goalserve ?? null,
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

router.get("/debug-goalserve", async (_req, res) => {
  function summarize(
    fixtures: { providerId?: string; matchId?: string; home?: string; away?: string; league?: string; stateId?: number; kickoffTimestamp?: number }[],
    label: string,
  ) {
    const total = fixtures.length;
    const stateCounts: Record<string, number> = {};
    let emptyHome = 0;
    let emptyAway = 0;
    let emptyLeague = 0;
    let passedGsUpcoming = 0;
    const topEmpty: Array<{ id: string; where: "home" | "away" | "league"; raw: any }> = [];
    for (const f of fixtures) {
      const sid = String(f?.stateId ?? "undefined");
      stateCounts[sid] = (stateCounts[sid] ?? 0) + 1;
      if (!f?.home?.trim()) {
        emptyHome++;
        if (topEmpty.length < 10) topEmpty.push({ id: f?.matchId ?? f?.providerId ?? "", where: "home", raw: f });
      }
      if (!f?.away?.trim()) {
        emptyAway++;
        if (topEmpty.length < 10) topEmpty.push({ id: f?.matchId ?? f?.providerId ?? "", where: "away", raw: f });
      }
      if (!f?.league?.trim()) {
        emptyLeague++;
        if (topEmpty.length < 10) topEmpty.push({ id: f?.matchId ?? f?.providerId ?? "", where: "league", raw: f });
      }
      if (gsIsUpcoming({ stateId: f.stateId, kickoffTimestamp: f.kickoffTimestamp })) passedGsUpcoming++;
    }
    return {
      label,
      total,
      stateCounts,
      emptyHome,
      emptyAway,
      emptyLeague,
      passedGsUpcomingFilter: passedGsUpcoming,
      topEmptySamples: topEmpty,
    };
  }
  try {
    if (!CONFIG.ENABLE_GOALSERVE) {
      res.status(200).json({ enabled: false, message: "ENABLE_GOALSERVE=false; saltei debug GoalServe." });
      return;
    }
    const start = Date.now();
    const [
      football_up_raw,
      football_lv_raw,
      tennis_up_raw,
      tennis_lv_raw,
      basket_up_raw,
      basket_lv_raw,
      hockey_up_raw,
      hockey_lv_raw,
      baseball_up_raw,
      baseball_lv_raw,
      volley_up_raw,
      volley_lv_raw,
      mma_up_raw,
      mma_lv_raw,
    ] = await Promise.all([
      getGoalServeFootballUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeFootballLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeTennisUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeTennisLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeBasketballUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeBasketballLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeHockeyUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeHockeyLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeBaseballUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeBaseballLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeVolleyballUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeVolleyballLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeMmaUpcomingRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
      getGoalServeMmaLiveRaw().catch((e) => [{ error: String(e?.message ?? e) } as any]),
    ]);
    res.status(200).json({
      ms: Date.now() - start,
      sports: {
        football: {
          upcoming: summarize(football_up_raw, "football-upcoming"),
          live: summarize(football_lv_raw, "football-live"),
        },
        tennis: {
          upcoming: summarize(tennis_up_raw, "tennis-upcoming"),
          live: summarize(tennis_lv_raw, "tennis-live"),
        },
        basketball: {
          upcoming: summarize(basket_up_raw, "basketball-upcoming"),
          live: summarize(basket_lv_raw, "basketball-live"),
        },
        hockey: {
          upcoming: summarize(hockey_up_raw, "hockey-upcoming"),
          live: summarize(hockey_lv_raw, "hockey-live"),
        },
        baseball: {
          upcoming: summarize(baseball_up_raw, "baseball-upcoming"),
          live: summarize(baseball_lv_raw, "baseball-live"),
        },
        volleyball: {
          upcoming: summarize(volley_up_raw, "volleyball-upcoming"),
          live: summarize(volley_lv_raw, "volleyball-live"),
        },
        mma: {
          upcoming: summarize(mma_up_raw, "mma-upcoming"),
          live: summarize(mma_lv_raw, "mma-live"),
        },
      },
      lastSuccessfulFetch: {
        goalserve: (globalThis as any).__lastFetchTs?.goalserve ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      error: String(err?.message ?? err),
      stack: String(err?.stack ?? "").slice(0, 800),
    });
  }
});

export default router;
