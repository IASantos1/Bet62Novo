import { Router, type Request, type Response } from "express";
import type { IRouter } from "express";
import { CONFIG } from "../../lib/config.js";
import { goalApi, type GoalApiOdds } from "../../services/goalapi/index.js";
import { pulseScore } from "../../providers/pulsescore/client.js";
import {
  buildPulseScoreMarkets,
  getPulseScorePrematchStatus,
  getPulseScoreShadowSyncStatus,
  getPrematchPulseScorePricedFixtureIds,
  getPrematchPulsePrice,
  runPrematchPulseScoreSync,
} from "../../providers/pulsescore/shadowMatchSync.js";
import { normalizePulseScoreEvent, type NormalizedFootballEvent } from "../../providers/pulsescore/normalizer.js";
import { liveMatchState, buildUpcomingMatches } from "../matches.js";
import { matchGoalApiFixtureToPulseScore } from "../../matching/footballMatchEngine.js";
import { adminMiddleware } from "../../middlewares/adminAuth.js";

const router: IRouter = Router();

// These are debug/diagnostic routes only — several of them (notably
// /run-prematch-sync-now and /match-fuzzy-by-name) trigger real, rate-limited
// upstream calls to GOAL API/PulseScore on demand. Left unauthenticated,
// anyone on the internet could hammer this to exhaust the shared PulseScore
// 1-req/sec quota that the real live/prematch sync pipelines depend on —
// gate the whole router behind the same admin auth every other diagnostic
// endpoint in this codebase uses.
router.use(adminMiddleware);

function ok(data: unknown): { ok: true; generatedAt: string; data: unknown } {
  return { ok: true, generatedAt: new Date().toISOString(), data };
}
function fail(status: number, reason: string, detail?: unknown) {
  return { ok: false, status, reason, detail, generatedAt: new Date().toISOString() };
}

router.get("/providers-health", async (_req: Request, res: Response) => {
  const result: any = {};

  result.configFlags = {
    GOAL_API_KEY: CONFIG.GOAL_API_KEY ? "SET" : "MISSING",
    PULSESCORE_API_KEY: CONFIG.PULSESCORE_API_KEY ? "SET" : "MISSING",
    FOOTBALL_ODDS_PROVIDER: CONFIG.FOOTBALL_ODDS_PROVIDER,
    FOOTBALL_DAILY_PROVIDER: CONFIG.FOOTBALL_DAILY_PROVIDER,
    FOOTBALL_REFERENCE_PROVIDER: CONFIG.FOOTBALL_REFERENCE_PROVIDER,
  };

  if (CONFIG.GOAL_API_KEY) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const t0 = Date.now();
      const fixtures = await goalApi.getFixturesByDate(today);
      result.goalApi = {
        ok: true,
        latencyMs: Date.now() - t0,
        fixtureCountToday: fixtures.length,
        first5: fixtures.slice(0, 5).map((f) => ({
          id: f.id,
          home: f.homeTeam?.name,
          away: f.awayTeam?.name,
          status: f.matchStatus,
          league: f.leagueName,
          kickoffUtc: f.kickoffUtc,
        })),
      };
    } catch (err: any) {
      result.goalApi = {
        ok: false,
        error: err?.message ?? String(err),
      };
    }
  }

  if (CONFIG.PULSESCORE_API_KEY) {
    try {
      const t0 = Date.now();
      const leagues = await pulseScore.getSoccerLeagues({ limit: 5 });
      const t1 = Date.now();
      const upcoming = await pulseScore.getSoccerEvents({ limit: 5 });
      const t2 = Date.now();
      const live = await pulseScore.getLiveEvents({ sport: "soccer", limit: 5 });
      const t3 = Date.now();
      const leaguesArr = (leagues as any).leagues ?? leagues;
      const upcomingArr = (upcoming as any).events ?? upcoming;
      const liveArr = (live as any).events ?? live;
      result.pulseScore = {
        ok: true,
        leaguesLatencyMs: t1 - t0,
        upcomingLatencyMs: t2 - t1,
        liveLatencyMs: t3 - t2,
        leaguesCount: Array.isArray(leaguesArr) ? leaguesArr.length : (leagues as any).total ?? 0,
        upcomingCount: Array.isArray(upcomingArr) ? upcomingArr.length : (upcoming as any).total ?? 0,
        liveCount: Array.isArray(liveArr) ? liveArr.length : (live as any).total ?? 0,
        upcomingSample: (Array.isArray(upcomingArr) ? upcomingArr : []).slice(0, 5).map((e: any) => ({
          id: e.id ?? e.eventId,
          home: e.homeName,
          away: e.awayName,
          league: e.leagueName,
          kickoffUtc: e.kickoff,
          bookmaker: e.bookmaker,
          has1x2: !!e.markets?.find((m: any) => m.canonicalMarket === "1X2"),
        })),
        liveSample: (Array.isArray(liveArr) ? liveArr : []).slice(0, 5).map((e: any) => ({
          id: e.id ?? e.eventId,
          home: e.homeName,
          away: e.awayName,
          league: e.leagueName,
          score: `${e.homeScore ?? 0}-${e.awayScore ?? 0}`,
          minute: e.minute,
          bookmaker: e.bookmaker,
          has1x2: !!e.markets?.find((m: any) => m.canonicalMarket === "1X2"),
        })),
      };
    } catch (err: any) {
      result.pulseScore = {
        ok: false,
        error: err?.message ?? String(err),
      };
    }
  }

  res.json(ok(result));
});

router.get("/live-match-state-stats", (_req: Request, res: Response) => {
  const liveRows = [...liveMatchState.values()];
  const bySport: Record<string, number> = {};
  let goalApiFootball = 0;
  let goalApiFootballWithPulse = 0;
  let pulseNativeFootball = 0;
  for (const r of liveRows) {
    bySport[r.sport] = (bySport[r.sport] ?? 0) + 1;
    if (r.sport === "football") {
      if (r.id.startsWith("goalapi-football-")) {
        goalApiFootball++;
        if ((r as any)._priceSource === "pulsescore") goalApiFootballWithPulse++;
      }
      if (r.id.startsWith("pulsescore-football-")) pulseNativeFootball++;
    }
  }
  res.json(
    ok({
      totalLive: liveRows.length,
      bySport,
      goalApiFootball,
      goalApiFootball_priceSourcePulse: goalApiFootballWithPulse,
      goalApiFootball_coveragePct:
        goalApiFootball === 0 ? null : Number(((goalApiFootballWithPulse / goalApiFootball) * 100).toFixed(2)),
      pulseScoreNativeFootball: pulseNativeFootball,
      sampleLive: liveRows
        .filter((r) => r.sport === "football")
        .slice(0, 10)
        .map((r: any) => ({
          id: r.id,
          fixture: `${r.home} vs ${r.away}`,
          league: r.league,
          score: `${r.homeScore ?? 0}-${r.awayScore ?? 0}`,
          minute: r.minute,
          _priceSource: r._priceSource ?? null,
          odds1x2: r.odds,
          markets_snapshot: {
            has_handicap: !!r.markets?.handicap,
            has_totalGoals_over25: !!r.markets?.totalGoals?.over25,
            has_bothTeamsScore: !!r.markets?.bothTeamsScore?.yes,
            has_htft: !!r.markets?.halfTimeFullTime,
            has_correctScore: !!r.markets?.correctScoreFullTime,
          },
        })),
    }),
  );
});

router.get("/run-prematch-sync-now", async (_req: Request, res: Response) => {
  try {
    const upcoming = await buildUpcomingMatches();
    const fixturesToSync = upcoming
      .filter((m) => m.sport === "football" && String(m.id).startsWith("goalapi-football-"))
      .map((m) => {
        const gid = String(m.id).slice("goalapi-football-".length);
        return {
          providerMatchId: gid,
          home: m.home,
          away: m.away,
          leagueName: m.league,
          kickoffUtc: null,
        };
      });
    const syncResult = await runPrematchPulseScoreSync(fixturesToSync);
    const prematchStatus = getPulseScorePrematchStatus();
    const shadowStatus = getPulseScoreShadowSyncStatus();
    const pricedSet = getPrematchPulseScorePricedFixtureIds();
    res.json(
      ok({
        fixturesSentToSync: fixturesToSync.length,
        syncResult,
        prematchStatus,
        shadowLiveStatus: {
          lastRunAt: shadowStatus.lastRunAt,
          lastRunOk: shadowStatus.lastRunOk,
          lastError: shadowStatus.lastError,
          lastMatching: shadowStatus.matching
            ? {
                attempted: shadowStatus.matching.attempted,
                matched: shadowStatus.matching.matched,
                candidatePoolSize: shadowStatus.matching.candidatePoolSize,
                avgConfidence: shadowStatus.matching.avgConfidence,
                liveNameFloorMisses: shadowStatus.matching.liveNameFloorMisses,
                liveBelowThresholdMisses: shadowStatus.matching.liveBelowThresholdMisses,
                nearMisses: shadowStatus.matching.nearMisses?.slice?.(0, 5) ?? null,
              }
            : null,
          lastOddsComparison: shadowStatus.oddsComparison
            ? {
                compared: (shadowStatus.oddsComparison as any).compared ?? null,
                priced: (shadowStatus.oddsComparison as any).priced ?? null,
                totalMatched: (shadowStatus.oddsComparison as any).totalMatched ?? null,
                samples: (shadowStatus.oddsComparison as any).samples?.slice?.(0, 5) ?? [],
              }
            : null,
        },
        prematchPricedSetSize: pricedSet.size,
      }),
    );
  } catch (err: any) {
    res.status(500).json(fail(500, "Prematch sync failed", err?.message ?? String(err)));
  }
});

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  const m = aa.length;
  const n = bb.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

router.get("/match-fuzzy-by-name", async (req: Request, res: Response) => {
  const home = typeof req.query.home === "string" ? req.query.home.trim() : "";
  const away = typeof req.query.away === "string" ? req.query.away.trim() : "";
  if (!home || !away) {
    res.status(400).json(fail(400, "Missing query params: home e away obrigatórios"));
    return;
  }
  try {
    const candidatesResp = await pulseScore.getSoccerEvents({ page: 1, limit: 500 });
    const candidates = Array.isArray(candidatesResp) ? candidatesResp : (candidatesResp as any).events ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const goalFixtures = CONFIG.GOAL_API_KEY ? await goalApi.getFixturesByDate(today) : [];
    const todayGoal = goalFixtures.find(
      (f) =>
        f.homeTeam?.name?.toLowerCase().includes(home.toLowerCase()) ||
        f.awayTeam?.name?.toLowerCase().includes(away.toLowerCase()),
    );
    const result = matchGoalApiFixtureToPulseScore(
      {
        id: String(todayGoal?.id ?? "manual-test"),
        homeTeamName: home,
        awayTeamName: away,
        leagueName: todayGoal?.leagueName,
        kickoffUtc: todayGoal?.kickoffUtc,
      },
      candidates,
    );
    const byId = new Map(candidates.map((c: any) => [c.id ?? c.eventId, c]));
    res.json(
      ok({
        query: { home, away },
        goalApiFixture: todayGoal
          ? {
              id: todayGoal.id,
              home: todayGoal.homeTeam?.name,
              away: todayGoal.awayTeam?.name,
              league: todayGoal.leagueName,
              kickoffUtc: todayGoal.kickoffUtc,
            }
          : null,
        candidate: result
          ? {
              pulseScoreEventId: result.pulseScoreEventId,
              confidence: result.confidence,
              signals: result.signals,
              event: (() => {
                const ev = byId.get(result.pulseScoreEventId);
                return ev ? {
                  homeName: (ev as any).homeName,
                  awayName: (ev as any).awayName,
                  leagueName: (ev as any).leagueName,
                  kickoff: (ev as any).kickoff,
                } : null;
              })(),
            }
          : null,
        top5CandidateConfidences: candidates
          .map((c: any) => {
            const hn = String(c.homeName ?? "");
            const an = String(c.awayName ?? "");
            const hr = Math.max(
              home === "" ? 0 : 1 - lev(home, hn) / Math.max(home.length, hn.length),
              away === "" ? 0 : 1 - lev(away, an) / Math.max(away.length, an.length),
            );
            return { id: c.id ?? c.eventId, h: c.homeName, a: c.awayName, simRaw: Number(hr.toFixed(2)) };
          })
          .sort((a: any, b: any) => b.simRaw - a.simRaw)
          .slice(0, 5),
      }),
    );
  } catch (err: any) {
    res.status(500).json(fail(500, "Fuzzy matching failed", err?.message ?? String(err)));
  }
});

router.get("/fixture-odds-compare", async (req: Request, res: Response) => {
  const goalApiId = typeof req.query.goalApiId === "string" ? req.query.goalApiId.trim() : "";
  const pulseId = typeof req.query.pulseId === "string" ? req.query.pulseId.trim() : "";
  const tryLookup = getPrematchPulsePrice(goalApiId);
  const out: any = { goalApiId, pulseId, prematchCacheHit: !!tryLookup };

  if (tryLookup) {
    out.pulseFromCache = {
      odds: tryLookup.odds,
      pulseScoreEventId: tryLookup.pulseScoreEventId,
      marketKeys: Object.keys(tryLookup.markets).filter(
        (k) => (tryLookup.markets as any)[k] != null,
      ),
    };
  }
  if (pulseId && CONFIG.PULSESCORE_API_KEY) {
    try {
      const t0 = Date.now();
      const ev: any = await pulseScore.getSoccerEventById(pulseId);
      const t1 = Date.now();
      const normalized: NormalizedFootballEvent = normalizePulseScoreEvent(ev);
      const markets = buildPulseScoreMarkets(normalized);
      out.pulseDirect = {
        latencyMs: t1 - t0,
        bookmaker: ev.bookmaker,
        home: ev.homeName,
        away: ev.awayName,
        marketCount: ev.markets?.length ?? 0,
        canonical1x2: normalized.matchResult?.home ?? null,
        mainOdds: normalized.matchResult ?? null,
        normalizedKeys: Object.keys(normalized).filter((k) => {
          const v = (normalized as any)[k];
          if (Array.isArray(v)) return v.length > 0;
          if (v instanceof Map) return v.size > 0;
          return v != null && v !== "";
        }),
        builtMarkets_nonNullKeys: Object.keys(markets).filter(
          (k) => {
            const v = (markets as any)[k];
            if (typeof v === "number") return v > 0;
            if (Array.isArray(v)) return v.length > 0;
            if (v && typeof v === "object") return Object.values(v).some((x) => typeof x === "number" && x > 0);
            return v != null;
          },
        ),
        builtOdds1x2: normalized.matchResult
          ? { home: normalized.matchResult.home, draw: normalized.matchResult.draw, away: normalized.matchResult.away }
          : { home: null, draw: null, away: null },
      };
    } catch (err: any) {
      out.pulseDirect = { error: err?.message ?? String(err) };
    }
  }
  if (goalApiId && CONFIG.GOAL_API_KEY) {
    try {
      const list: GoalApiOdds[] = await (goalApi as any).getFixtureOdds
        ? (goalApi as any).getFixtureOdds(goalApiId)
        : [];
      out.goalApiOdds = {
        count: list.length,
        first10: list.slice(0, 10).map((o: GoalApiOdds) => ({
          bookmaker: o.bookmaker ?? null,
          odd1: o.odd1 ?? null,
          oddX: o.oddX ?? null,
          odd2: o.odd2 ?? null,
          odd1x: o.odd1x ?? null,
          odd12: o.odd12 ?? null,
          oddX2: o.oddX2 ?? null,
          btsYes: o.btsYes ?? null,
          btsNo: o.btsNo ?? null,
          asianHandicap: o.asianHandicap ?? null,
          overUnder: o.overUnder ?? null,
        })),
      };
    } catch (err: any) {
      out.goalApiOdds = { error: err?.message ?? String(err) };
    }
  }
  res.json(ok(out));
});

router.get("/shadow-status-snapshot", (_req: Request, res: Response) => {
  res.json(
    ok({
      shadowLive: getPulseScoreShadowSyncStatus(),
      prematch: getPulseScorePrematchStatus(),
      prematchPricedIdsSize: getPrematchPulseScorePricedFixtureIds().size,
    }),
  );
});

// Pure read — does GOAL API's own daily-fixture feed actually carry Japan /
// South Korea / China leagues today? Answers that empirically instead of
// guessing from the local priority-tier table (which only says what BET62
// does with a league IF GOAL API sends it, not whether GOAL API sends it at
// all). Not wired into any live path — diagnostic only.
router.get("/goalapi-country-coverage", async (req: Request, res: Response) => {
  if (!CONFIG.GOAL_API_KEY) {
    res.status(503).json(fail(503, "GOAL_API_KEY not configured"));
    return;
  }
  const days = Math.min(Math.max(Number(req.query.days) || 1, 1), 8);
  const countriesParam =
    typeof req.query.countries === "string" && req.query.countries.trim()
      ? req.query.countries.split(",").map((c) => c.trim().toLowerCase())
      : ["japan", "korea", "south korea", "china"];
  try {
    const dates = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const perDay = await Promise.all(dates.map((date) => goalApi.getFixturesByDate(date)));
    const allFixtures = perDay.flat();
    const leagueCounts = new Map<string, number>();
    for (const fx of allFixtures) {
      const ln = fx.leagueName ?? "(sem nome)";
      leagueCounts.set(ln, (leagueCounts.get(ln) ?? 0) + 1);
    }
    const byCountry: Record<string, { league: string; fixtureCount: number }[]> = {};
    for (const country of countriesParam) {
      byCountry[country] = [...leagueCounts.entries()]
        .filter(([league]) => league.toLowerCase().startsWith(country))
        .map(([league, fixtureCount]) => ({ league, fixtureCount }));
    }
    res.json(
      ok({
        datesChecked: dates,
        totalFixtures: allFixtures.length,
        totalDistinctLeagues: leagueCounts.size,
        byCountry,
        note: "Ligas listadas aqui são exatamente o que a GOAL API está retornando agora — não passam pelos filtros/bloqueios do BET62.",
      }),
    );
  } catch (err: any) {
    res.status(500).json(fail(500, "GOAL API fetch failed", err?.message ?? String(err)));
  }
});

export default router;
