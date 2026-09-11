// PulseScore Fase 1 — shadow matching, and (as of 2026-09-10, per the
// user's explicit decision) the REAL live football odds source. This
// records which PulseScore event corresponds to which GOAL-API-sourced
// canonical match, and — once a fixture is matched — writes PulseScore's
// own match-result/BTTS/double-chance/total-goals prices directly into
// routes/matches.ts's `liveMatchState`, the same Map routes/bets.ts reads
// at bet acceptance. GOAL API's own live-odds endpoint was confirmed
// broken this session (wrong response shape entirely — see
// routes/matches.ts's live-odds diagnostic) and, independent of that bug,
// the user decided PulseScore should be the sole live odds source going
// forward regardless: no synthetic Poisson fallback, no dual-source
// conflict. A fixture only becomes bettable once PulseScore has actually
// priced its match-result market — see runOddsComparisonPhase and
// buildLivePayload's visibility filter (routes/matches.ts), which requires
// `_priceSource === "pulsescore"` before a football fixture appears in the
// live betting list at all.
//
// Scoped to LIVE football only for this first pass: PulseScore's pre-match
// /soccer/events has ~3450 events across ~690 pages at the limit=5 tested
// by the user — paginating all of that without knowing the provider's real
// max page size isn't reasonable yet. /live-events has ~30-58 observed in
// production, a much smaller and more tractable pool, and live matches are
// the higher-value target anyway (the harder, more valuable problem for a
// live book). Pre-match odds are a natural follow-up once this is validated.
import { logger } from "../../lib/logger.js";
import { CONFIG } from "../../lib/config.js";
import {
  attachProviderMapping,
  ensureCanonicalMatch,
  getMatchedLiveFootballFixtures,
  getUnmatchedGoalApiFootballMatches,
  type MatchedLiveFootballFixture,
  type UnmatchedGoalApiMatch,
} from "../../lib/canonicalMatchCatalog.js";
import { matchGoalApiFixtureToPulseScore, debugBestCandidate, type GoalApiFixtureRef } from "../../matching/footballMatchEngine.js";
import { isVirtualPulseScoreLeague } from "./filters.js";
import { normalizePulseScoreEvent, type NormalizedFootballEvent, type NormalizedMarketGroup } from "./normalizer.js";
import { pulseScore } from "./client.js";
import type { PulseScoreEvent } from "./types.js";
import { liveMatchState, broadcastMatchDelta, type LiveMatchState } from "../../routes/matches.js";

type Markets = LiveMatchState["markets"];

const PROVIDER = "pulsescore";
const PROVIDER_SPORT = "football";
/** Safety cap on pagination — PulseScore's real max page size for
 * live-events isn't confirmed, so this bounds worst-case request count
 * regardless of what limit the provider actually honors. */
const MAX_PAGES = 10;

async function fetchLivePulseScoreCandidates(): Promise<PulseScoreEvent[]> {
  const candidates: PulseScoreEvent[] = [];
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const resp = await pulseScore.getLiveEvents({ page, limit: 50, sport: "soccer" });
    for (const ev of resp.events) {
      if (isVirtualPulseScoreLeague(ev.league)) continue;
      candidates.push(ev);
    }
    if (!resp.hasNextPage) break;
  }
  return candidates;
}

/** @public — used by routes/test for odds comparison. */
export type MatchingPhaseResult = {
  attempted: number;
  matched: number;
  unmatched: number;
  avgConfidence: number | null;
  /** Diagnostic breakdown — see the header note on getUnmatchedGoalApiFootballMatches's
   * status field: most of `unmatched` is expected to be scheduled fixtures
   * that simply haven't kicked off yet (PulseScore's candidate pool is
   * live-only), so counting those as "misses" would be misleading. These
   * fields only ever describe the subset that's actually live right now. */
  liveAttempted: number;
  /** Live fixtures where even the best PulseScore candidate's team-name
   * similarity never cleared NAME_FLOOR — no kickoff/league agreement
   * could have rescued these; likely a real name-normalization gap. */
  liveNameFloorMisses: number;
  /** Live fixtures where the best candidate's name cleared NAME_FLOOR but
   * the combined confidence still fell short of MIN_REPORTABLE_CONFIDENCE
   * — plausible pairs the threshold is (for now) rejecting. */
  liveBelowThresholdMisses: number;
  /** How many non-virtual live PulseScore events this round actually
   * compared against — the real, current size of the pool every live
   * GOAL API fixture was matched against, whatever PulseScore's total
   * cross-league catalog size might be. */
  candidatePoolSize: number;
  /** Same data as the "[pulsescore-shadow-match] closest near-misses"
   * log line, kept here too so it's visible via
   * GET /api/admin/pulsescore-status — for each live fixture that found
   * no match, the single best PulseScore candidate even though it didn't
   * clear the thresholds, so a reader can tell "no real counterpart in
   * the pool" apart from "a real pair the name/confidence floor rejected". */
  nearMisses: NearMissSample[];
};

type NearMissSample = {
  matchId: number;
  goalApiFixture: string;
  bestPulseScoreEventId: string | null;
  /** The best candidate's actual team names — side by side with
   * goalApiFixture above, this is what actually lets a reader tell a
   * genuine non-match apart from a name-normalization gap. */
  pulseScoreFixture: string | null;
  confidence: number | null;
  nameSim: number | null;
  homeNameSimilarity: number | null;
  awayNameSimilarity: number | null;
  passedNameFloor: boolean;
  kickoffDeltaMinutes: number | null;
};

async function runMatchingPhase(
  unmatched: UnmatchedGoalApiMatch[],
  candidates: PulseScoreEvent[],
): Promise<MatchingPhaseResult> {
  let matched = 0;
  let totalConfidence = 0;
  let liveAttempted = 0;
  let liveNameFloorMisses = 0;
  let liveBelowThresholdMisses = 0;
  const nearMissSamples: NearMissSample[] = [];

  for (const goalApiMatch of unmatched) {
    const fixture: GoalApiFixtureRef = {
      id: goalApiMatch.providerMatchId,
      homeTeamName: goalApiMatch.home,
      awayTeamName: goalApiMatch.away,
      leagueName: goalApiMatch.leagueName,
      kickoffUtc: goalApiMatch.kickoffUtc ? goalApiMatch.kickoffUtc.toISOString() : null,
    };
    const candidate = matchGoalApiFixtureToPulseScore(fixture, candidates);

    if (!candidate) {
      // Only diagnose LIVE fixtures — a scheduled one correctly has
      // nothing to match yet against PulseScore's live-only candidate pool.
      if (goalApiMatch.status === "live") {
        liveAttempted++;
        const diag = debugBestCandidate(fixture, candidates);
        if (diag.passedNameFloor) liveBelowThresholdMisses++;
        else liveNameFloorMisses++;
        nearMissSamples.push({
          matchId: goalApiMatch.matchId,
          goalApiFixture: `${goalApiMatch.home} vs ${goalApiMatch.away}`,
          bestPulseScoreEventId: diag.pulseScoreEventId,
          pulseScoreFixture:
            diag.pulseScoreHome != null && diag.pulseScoreAway != null
              ? `${diag.pulseScoreHome} vs ${diag.pulseScoreAway}`
              : null,
          confidence: diag.confidence,
          nameSim: diag.nameSim,
          homeNameSimilarity: diag.homeNameSimilarity,
          awayNameSimilarity: diag.awayNameSimilarity,
          passedNameFloor: diag.passedNameFloor,
          kickoffDeltaMinutes: diag.kickoffDeltaMinutes,
        });
      }
      continue;
    }

    const pulseScoreEvent = candidates.find((ev) => ev.eventId === candidate.pulseScoreEventId);
    if (!pulseScoreEvent) continue; // shouldn't happen — defensive only

    try {
      await attachProviderMapping({
        matchId: goalApiMatch.matchId,
        provider: PROVIDER,
        providerSport: PROVIDER_SPORT,
        providerMatchId: candidate.pulseScoreEventId,
        home: pulseScoreEvent.home,
        away: pulseScoreEvent.away,
        confidence: candidate.confidence,
      });
      matched++;
      totalConfidence += candidate.confidence;
    } catch (err) {
      logger.error(
        { err, matchId: goalApiMatch.matchId, pulseScoreEventId: candidate.pulseScoreEventId },
        "[pulsescore-shadow-match] attachProviderMapping failed",
      );
    }
  }

  nearMissSamples.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
  const result: MatchingPhaseResult = {
    attempted: unmatched.length,
    matched,
    unmatched: unmatched.length - matched,
    avgConfidence: matched > 0 ? Math.round(totalConfidence / matched) : null,
    liveAttempted,
    liveNameFloorMisses,
    liveBelowThresholdMisses,
    candidatePoolSize: candidates.length,
    nearMisses: nearMissSamples.slice(0, 8),
  };
  logger.info(
    {
      attempted: result.attempted,
      matched: result.matched,
      unmatched: result.unmatched,
      avgConfidence: result.avgConfidence,
      liveAttempted: result.liveAttempted,
      liveNameFloorMisses: result.liveNameFloorMisses,
      liveBelowThresholdMisses: result.liveBelowThresholdMisses,
      candidatePoolSize: result.candidatePoolSize,
    },
    "[pulsescore-shadow-match] matching round complete",
  );
  if (result.nearMisses.length > 0) {
    logger.info(
      { samples: result.nearMisses, totalLiveMisses: nearMissSamples.length },
      "[pulsescore-shadow-match] closest near-misses among live, still-unmatched fixtures (diagnostic only)",
    );
  }
  return result;
}

function pctDelta(candidate: number, reference: number): number | null {
  if (!(reference > 0)) return null;
  return Math.round(((candidate - reference) / reference) * 1000) / 10;
}

/** BET62's totalGoals only tracks fixed .5-increment lines (see
 * routes/matches.ts's AdvancedMarkets) — this is the wiring-time decision
 * the normalizer's header comment deliberately deferred: PulseScore emits
 * many lines per market (confirmed real: 5.5, 5.75, AND 6.25 on the same
 * fixture), so only the lines BET62 already has a slot for are compared;
 * anything else is neither fabricated nor forced into the wrong slot. */
const OVER_UNDER_LINES: Array<{
  line: number;
  bet62Over: keyof Markets["totalGoals"];
  bet62Under: keyof Markets["totalGoals"];
}> = [
  { line: 0.5, bet62Over: "over05", bet62Under: "under05" },
  { line: 1.5, bet62Over: "over15", bet62Under: "under15" },
  { line: 2.5, bet62Over: "over25", bet62Under: "under25" },
  { line: 3.5, bet62Over: "over35", bet62Under: "under35" },
  { line: 4.5, bet62Over: "over45", bet62Under: "under45" },
  { line: 5.5, bet62Over: "over55", bet62Under: "under55" },
  { line: 6.5, bet62Over: "over65", bet62Under: "under65" },
];

function extractPulseScoreOverUnderByLine(
  markets: NormalizedMarketGroup[],
): Map<number, { over?: number; under?: number }> {
  const group = markets.find((m) => m.market === "OVER_UNDER" && m.period === "FULL_TIME");
  const byLine = new Map<number, { over?: number; under?: number }>();
  if (!group) return byLine;
  for (const sel of group.selections) {
    if (sel.line == null || (sel.outcome !== "OVER" && sel.outcome !== "UNDER")) continue;
    const entry = byLine.get(sel.line) ?? {};
    if (sel.outcome === "OVER") entry.over = sel.odds;
    else entry.under = sel.odds;
    byLine.set(sel.line, entry);
  }
  return byLine;
}

/** PulseScore's raw CORRECT_SCORE market (1xBet feed) carries every
 *  scoreline the book prices — commonly 50-60+ combinations up to 10+
 *  goals, most of them long-tail entries capped at the book's own ~100.00
 *  ceiling price. Real bookmakers never surface that whole grid in their
 *  UI; they show a standard low-scoring set (here: 0-0 through 3-3, the
 *  same 16-cell grid BET62's own legacy synthetic generator used) and
 *  fold everything else into a single "Outro" bucket (the exact key
 *  settlement.ts's correct-score resolver already recognizes as the
 *  catch-all — see below). Curating this server-side keeps the real
 *  PulseScore prices for the cells bettors actually pick, without shipping
 *  (or rendering) a 60-row wall of mostly ~100.00 filler. The "Outro"
 *  price is a simple implied-probability
 *  aggregate of the folded cells' real odds (1/odd summed, then
 *  inverted) — an approximation, not a book-exact price, since combining
 *  already-margined odds this way doesn't preserve the book's overround
 *  exactly, but it's in the right ballpark and never fabricated from
 *  nothing (every input is a real PulseScore price). */
const CORRECT_SCORE_STANDARD_MAX_GOALS = 3;

function curateCorrectScoreGrid(
  raw: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!raw) return undefined;
  const out: Record<string, number> = {};
  let otherImpliedProb = 0;
  let hasOther = false;
  for (const [key, odd] of Object.entries(raw)) {
    const m = key.match(/^(\d+)-(\d+)$/);
    if (!m) {
      // Non-numeric keys (e.g. an aggregate "home-any"/"away-any"/
      // "any-other" bucket PulseScore already provides) pass through as-is
      // — never double-bucketed on top of our own "Outro".
      out[key] = odd;
      continue;
    }
    const home = Number(m[1]);
    const away = Number(m[2]);
    if (home <= CORRECT_SCORE_STANDARD_MAX_GOALS && away <= CORRECT_SCORE_STANDARD_MAX_GOALS) {
      out[key] = odd;
    } else if (odd > 1) {
      otherImpliedProb += 1 / odd;
      hasOther = true;
    }
  }
  if (hasOther && otherImpliedProb > 0 && out["Outro"] === undefined) {
    // Must be the literal key "Outro" (singular) — settlement.ts's FT/HT
    // correct-score resolver (and the legacy synthetic generator this
    // curation mirrors) only recognizes that exact key as the catch-all
    // bucket; any other spelling (e.g. "Outros") would let a client submit
    // and get accepted a bet that settlement can never resolve.
    //
    // Clamped the same way the legacy synthetic generator clamped its own
    // "Outro" bucket: summing per-cell implied probabilities that each
    // already carry the book's own margin can push the raw aggregate
    // outside a valid decimal-odds range (<=1.0, or absurdly high) when
    // many long-tail cells are folded together — a floor/ceiling keeps the
    // result a sane, always-valid price regardless of how many cells land
    // in the bucket.
    const raw = 1 / otherImpliedProb;
    out["Outro"] = Math.round(Math.max(1.01, Math.min(500, raw)) * 100) / 100;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Builds a full LiveMatchState.markets object from PulseScore's real
 *  normalized markets — never partially merged with whatever the fixture's
 *  previous markets were (which could be leftover synthetic-drift values
 *  from before this fixture had a PulseScore price at all). After the
 *  2026-09-10 "every oddity must come from PulseScore" decision, we now
 *  populate 100% of AdvancedMarkets football slots from real PulseScore
 *  upstream data whenever PulseScore actually carries them. Markets
 *  PulseScore doesn't cover this round are zeroed/left absent (never
 *  fabricated) so the frontend (home.tsx) can hide the rows safely with
 *  its existing truthy/>0/safe() guards. */
/** @public — used by routes/test for odds comparison. */
export function buildPulseScoreMarkets(normalized: NormalizedFootballEvent): Markets {
  const psOverUnder = extractPulseScoreOverUnderByLine(normalized.markets);
  const totalGoals: Markets["totalGoals"] = {
    over05: 0, under05: 0, over15: 0, under15: 0, over25: 0, under25: 0,
    over35: 0, under35: 0, over45: 0, under45: 0, over55: 0, under55: 0,
    over65: 0, under65: 0,
  };
  for (const { line, bet62Over, bet62Under } of OVER_UNDER_LINES) {
    const ps = psOverUnder.get(line);
    if (ps?.over != null) totalGoals[bet62Over] = ps.over;
    if (ps?.under != null) totalGoals[bet62Under] = ps.under;
  }

  const doubleChance = normalized.doubleChance
    ? {
        homeOrDraw: normalized.doubleChance.homeOrDraw,
        awayOrDraw: normalized.doubleChance.drawOrAway,
        homeOrAway: normalized.doubleChance.homeOrAway,
      }
    : { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 };

  const bothTeamsScore = normalized.bothTeamsToScore
    ? { yes: normalized.bothTeamsToScore.yes, no: normalized.bothTeamsToScore.no }
    : { yes: 0, no: 0 };

  const handicap: Markets["handicap"] = {
    homeMinusOne: normalized.handicapLines?.get(-1.0)?.home ?? 0,
    awayPlusOne: normalized.handicapLines?.get(-1.0)?.away ?? 0,
    homeMinusOneHalf: normalized.handicapLines?.get(-0.5)?.home ?? 0,
    awayPlusOneHalf: normalized.handicapLines?.get(-0.5)?.away ?? 0,
  };

  const halfTime: Markets["halfTime"] = normalized.matchResult1H
    ? { home: normalized.matchResult1H.home, draw: normalized.matchResult1H.draw, away: normalized.matchResult1H.away }
    : { home: 0, draw: 0, away: 0 };

  const firstGoal: Markets["firstGoal"] = normalized.firstGoalTeam
    ? { home: normalized.firstGoalTeam.home, noGoal: normalized.firstGoalTeam.noGoal, away: normalized.firstGoalTeam.away }
    : { home: 0, noGoal: 0, away: 0 };

  const drawNoBet = normalized.drawNoBet;

  const asianHandicap = normalized.asianHandicapFull;

  const atl = normalized.asianTotalLines;
  const asianTotals: NonNullable<Markets["asianTotals"]> | undefined = atl
    ? {
        o05: atl.get(0.5)?.over ?? 0, u05: atl.get(0.5)?.under ?? 0,
        o45: atl.get(4.5)?.over ?? 0, u45: atl.get(4.5)?.under ?? 0,
        o55: atl.get(5.5)?.over ?? 0, u55: atl.get(5.5)?.under ?? 0,
        o225: atl.get(2.25)?.over ?? 0, u225: atl.get(2.25)?.under ?? 0,
        o275: atl.get(2.75)?.over ?? 0, u275: atl.get(2.75)?.under ?? 0,
      }
    : undefined;

  const htft = normalized.htft;

  const correctScore = curateCorrectScoreGrid(normalized.correctScore);
  const htCorrectScore = curateCorrectScoreGrid(normalized.htCorrectScore);
  const h2CorrectScore: Record<string, number> | undefined = undefined;

  const anytimeGoalscorer = normalized.anytimeGoalscorer;
  const firstGoalscorer = normalized.firstGoalscorer;
  const lastGoalscorer = normalized.lastGoalscorer;

  const cl = normalized.cornersLines;
  const corners: NonNullable<Markets["corners"]> | undefined = cl
    ? {
        o85: cl.get(8.5)?.over ?? 0, u85: cl.get(8.5)?.under ?? 0,
        o95: cl.get(9.5)?.over ?? 0, u95: cl.get(9.5)?.under ?? 0,
        o105: cl.get(10.5)?.over ?? 0, u105: cl.get(10.5)?.under ?? 0,
      }
    : undefined;

  const kl = normalized.cardsLines;
  const cards: NonNullable<Markets["cards"]> | undefined = kl
    ? {
        o35: kl.get(3.5)?.over ?? 0, u35: kl.get(3.5)?.under ?? 0,
        o45: kl.get(4.5)?.over ?? 0, u45: kl.get(4.5)?.under ?? 0,
      }
    : undefined;

  const goalOddEven = normalized.totalGoalsOddEven;

  const tgh = normalized.teamGoalsHomeLines;
  const tga = normalized.teamGoalsAwayLines;
  const teamGoals: NonNullable<Markets["teamGoals"]> | undefined =
    tgh || tga
      ? {
          homeOver05: tgh?.get(0.5)?.over, homeUnder05: tgh?.get(0.5)?.under,
          homeOver15: tgh?.get(1.5)?.over, homeUnder15: tgh?.get(1.5)?.under,
          homeOver25: tgh?.get(2.5)?.over, homeUnder25: tgh?.get(2.5)?.under,
          awayOver05: tga?.get(0.5)?.over, awayUnder05: tga?.get(0.5)?.under,
          awayOver15: tga?.get(1.5)?.over, awayUnder15: tga?.get(1.5)?.under,
          awayOver25: tga?.get(2.5)?.over, awayUnder25: tga?.get(2.5)?.under,
        }
      : undefined;

  // Per-team corners: unlike the fixed shared slots the combined `corners`
  // market uses, each team's real range differs enough (home commonly
  // 8-12, away commonly 1-5) that a single dynamic line makes more sense —
  // take whichever line the book listed first (real data confirms
  // PulseScore lists these ascending, so this is its lowest/most-central
  // line, not an arbitrary one).
  const firstLine = (m: Map<number, { over: number; under: number }> | undefined) => {
    if (!m || m.size === 0) return undefined;
    const [line, v] = [...m.entries()][0]!;
    return { line, over: v.over, under: v.under };
  };
  const homeCorners = firstLine(normalized.homeCornersLines);
  const awayCorners = firstLine(normalized.awayCornersLines);

  return {
    doubleChance,
    bothTeamsScore,
    totalGoals,
    handicap,
    halfTime,
    firstGoal,
    drawNoBet,
    asianHandicap,
    asianTotals,
    htft,
    correctScore,
    htCorrectScore,
    h2CorrectScore,
    anytimeGoalscorer,
    firstGoalscorer,
    lastGoalscorer,
    corners,
    cards,
    goalOddEven,
    teamGoals,
    homeCorners,
    awayCorners,
  };
}

/** Prices every fixture already matched to a PulseScore event: writes
 * PulseScore's real markets into LiveMatchState (routes/matches.ts) — the
 * same Map routes/bets.ts reads at bet acceptance — whenever the fixture
 * has a real match-result (1X2) price this round, then logs what's now
 * showing. A fixture with no matchResult this round is left exactly as it
 * was (never partially priced) and stays out of the bettable live list
 * (buildLivePayload's visibility filter requires `_priceSource ===
 * "pulsescore"`). The logged "comparison" is mostly a sanity echo once a
 * fixture is priced — bet62 and pulseScore are the same number by
 * construction going forward — but kept in this shape since it's already
 * wired into GET /api/admin/pulsescore-status and still useful to confirm
 * a write actually landed with the right values. */
type OddsComparisonSample = {
  matchId: number;
  fixture: string;
  matchConfidence: number;
  /** Score/minute each side was reporting AT THE MOMENT of this
   * comparison — a huge odds divergence is expected and harmless if one
   * side simply hasn't caught up to a recent goal yet; this is what lets
   * a reader tell that apart from a genuine pricing disagreement (or a
   * false-positive match) on an otherwise-agreeing scoreline. */
  matchState: {
    goalApi: { home: number | null; away: number | null; minute: number | null };
    pulseScore: { home: number | null; away: number | null; minute: number | null };
  };
  /** Whether this fixture is showing a real PulseScore price right now
   * (`LiveMatchState._priceSource === "pulsescore"`) — false means this
   * round had no matchResult to price with, so the fixture is still
   * exactly where it was before (and, per buildLivePayload's filter,
   * absent from the bettable live list). */
  bet62OddsAreReal: boolean;
  result: Record<string, unknown>;
};

type OddsComparisonPhaseResult = {
  compared: number;
  totalMatched: number;
  /** How many of `compared` fixtures actually got a real price written
   * this round (had a matchResult to price with). */
  priced: number;
  /** Same data as the per-fixture "[pulsescore-shadow-odds] live market
   * comparison" log line, kept here too so it's visible via
   * GET /api/admin/pulsescore-status without needing log access. Capped
   * (see SAMPLE_CAP) — this is a shadow-observability snapshot, not an
   * unbounded audit log. */
  samples: OddsComparisonSample[];
  /** GOAL API providerMatchIds priced this round — the caller (runOnce)
   * folds this into the module-level Set getPulseScorePricedFixtureIds()
   * reads, so buildLivePayload's visibility filter has an O(1) lookup. */
  pricedFixtureIds: string[];
};

const ODDS_SAMPLE_CAP = 25;

async function runOddsComparisonPhase(
  matchedFixtures: MatchedLiveFootballFixture[],
  candidates: PulseScoreEvent[],
): Promise<OddsComparisonPhaseResult> {
  let compared = 0;
  let priced = 0;
  const samples: OddsComparisonSample[] = [];
  const pricedFixtureIds: string[] = [];

  for (const fixture of matchedFixtures) {
    const liveMatchId = `goalapi-football-${fixture.goalApiProviderMatchId}`;
    let liveState = liveMatchState.get(liveMatchId);
    if (!liveState) continue; // no longer live on the GOAL API side this round

    const pulseScoreEvent = candidates.find((ev) => ev.eventId === fixture.otherProviderMatchId);
    if (!pulseScoreEvent) continue; // no longer in PulseScore's live pool this round

    const normalized = normalizePulseScoreEvent(pulseScoreEvent);

    // The actual pricing write — see buildPulseScoreMarkets's header for
    // why markets PulseScore doesn't cover are zeroed, not fabricated.
    // Only a real matchResult (the headline 1X2) makes this fixture
    // "priced" — a fixture with only e.g. totalGoals data this round stays
    // exactly as it was (unpriced fixtures never entered the bettable live
    // list in the first place, per buildLivePayload's filter).
    //
    // Extra safety guard (2026-09-10): the normalizer also zero-fills
    // missing legs (see normalizePulseScoreEvent in normalizer.ts), so a
    // half-populated shape like { home: 2.1, draw: 0, away: 0 } is
    // possible for providers that only carry 2-way markets. Treat those
    // as unpriced too — `_priceSource === "pulsescore"` must mean ALL
    // three 1X2 legs came from real upstream data, because
    // applyTieredMarketDrift skips the drift loop entirely once set,
    // which would otherwise lock in the zero (infinite-odds bug) until
    // the next comparison round. buildPulseScoreMarkets itself also
    // sanity checks all three legs before writing `markets.result`.
    const mr = normalized.matchResult;
    const all1x2LegsReal = mr
      && Number.isFinite(mr.home) && mr.home > 1
      && Number.isFinite(mr.draw) && mr.draw > 1
      && Number.isFinite(mr.away) && mr.away > 1;
    if (all1x2LegsReal) {
      const newOdds = { home: mr.home, draw: mr.draw, away: mr.away };
      const newMarkets = buildPulseScoreMarkets(normalized);
      const oddsChanged = JSON.stringify(newOdds) !== JSON.stringify(liveState.odds);
      const marketsChanged = JSON.stringify(newMarkets) !== JSON.stringify(liveState.markets);
      const versionBumped = oddsChanged || marketsChanged || liveState._priceSource !== "pulsescore";
      const updatedState: LiveMatchState = {
        ...liveState,
        odds: newOdds,
        markets: newMarkets,
        _priceSource: "pulsescore",
        marketVersion: versionBumped ? (liveState.marketVersion ?? 0) + 1 : liveState.marketVersion,
      };
      liveMatchState.set(liveMatchId, updatedState);
      if (oddsChanged || marketsChanged) {
        broadcastMatchDelta(liveMatchId, {
          odds: updatedState.odds,
          markets: updatedState.markets,
          marketVersion: updatedState.marketVersion,
        });
      }
      liveState = updatedState;
      pricedFixtureIds.push(fixture.goalApiProviderMatchId);
      priced++;
    }
    const bet62Markets = liveState.markets;

    const result: Record<string, unknown> = {};

    if (normalized.matchResult) {
      const ps = normalized.matchResult;
      const bet62 = liveState.odds;
      result.matchResult1X2 = {
        bet62,
        pulseScore: ps,
        deltaPct: { home: pctDelta(ps.home, bet62.home), draw: pctDelta(ps.draw, bet62.draw), away: pctDelta(ps.away, bet62.away) },
      };
    }

    if (normalized.bothTeamsToScore && bet62Markets.bothTeamsScore) {
      const ps = normalized.bothTeamsToScore;
      const bet62 = bet62Markets.bothTeamsScore;
      result.bothTeamsToScore = {
        bet62,
        pulseScore: ps,
        deltaPct: { yes: pctDelta(ps.yes, bet62.yes), no: pctDelta(ps.no, bet62.no) },
      };
    }

    if (normalized.doubleChance && bet62Markets.doubleChance) {
      const ps = normalized.doubleChance;
      const bet62 = bet62Markets.doubleChance;
      // Same concept, different field name on BET62's side: awayOrDraw
      // (bet62) === drawOrAway (PulseScore normalizer's naming).
      result.doubleChance = {
        bet62,
        pulseScore: ps,
        deltaPct: {
          homeOrDraw: pctDelta(ps.homeOrDraw, bet62.homeOrDraw),
          drawOrAway: pctDelta(ps.drawOrAway, bet62.awayOrDraw),
          homeOrAway: pctDelta(ps.homeOrAway, bet62.homeOrAway),
        },
      };
    }

    const psOverUnder = extractPulseScoreOverUnderByLine(normalized.markets);
    if (psOverUnder.size > 0) {
      const totalGoalsComparisons: Array<{
        line: number;
        bet62: { over: number; under: number };
        pulseScore: { over: number; under: number };
        deltaPct: { over: number | null; under: number | null };
      }> = [];
      for (const { line, bet62Over, bet62Under } of OVER_UNDER_LINES) {
        const ps = psOverUnder.get(line);
        if (!ps || ps.over == null || ps.under == null) continue;
        const bet62Over_ = bet62Markets.totalGoals[bet62Over];
        const bet62Under_ = bet62Markets.totalGoals[bet62Under];
        if (bet62Over_ == null || bet62Under_ == null) continue;
        totalGoalsComparisons.push({
          line,
          bet62: { over: bet62Over_, under: bet62Under_ },
          pulseScore: { over: ps.over, under: ps.under },
          deltaPct: { over: pctDelta(ps.over, bet62Over_), under: pctDelta(ps.under, bet62Under_) },
        });
      }
      if (totalGoalsComparisons.length > 0) result.totalGoals = totalGoalsComparisons;
    }

    if (Object.keys(result).length === 0) continue; // nothing comparable on both sides this round

    // score/matchClock are string/number per PulseScoreScore/PulseScoreMatchClock
    // — only populated on the live-events family (see types.ts), which is
    // exactly what this pool comes from, but still optional defensively.
    const psHome = pulseScoreEvent.score ? Number(pulseScoreEvent.score.home) : null;
    const psAway = pulseScoreEvent.score ? Number(pulseScoreEvent.score.away) : null;
    const matchState: OddsComparisonSample["matchState"] = {
      goalApi: { home: liveState.homeScore, away: liveState.awayScore, minute: liveState.minute },
      pulseScore: {
        home: Number.isFinite(psHome) ? psHome : null,
        away: Number.isFinite(psAway) ? psAway : null,
        minute: pulseScoreEvent.matchClock?.minute ?? null,
      },
    };

    const bet62OddsAreReal = liveState._priceSource === "pulsescore";

    compared++;
    logger.info(
      {
        matchId: fixture.matchId,
        matchConfidence: fixture.otherProviderConfidence,
        matchState,
        bet62OddsAreReal,
        ...result,
      },
      "[pulsescore-shadow-odds] live market comparison",
    );
    if (samples.length < ODDS_SAMPLE_CAP) {
      samples.push({
        matchId: fixture.matchId,
        fixture: `${liveState.home} vs ${liveState.away}`,
        matchConfidence: fixture.otherProviderConfidence,
        matchState,
        bet62OddsAreReal,
        result,
      });
    }
  }

  const result: OddsComparisonPhaseResult = {
    compared,
    totalMatched: matchedFixtures.length,
    priced,
    samples,
    pricedFixtureIds,
  };
  logger.debug(
    { compared, totalMatched: matchedFixtures.length, priced },
    "[pulsescore-shadow-odds] comparison round complete",
  );
  return result;
}

export type ShadowSyncStatus = {
  lastRunAt: number | null;
  lastRunOk: boolean;
  lastError: string | null;
  matching: MatchingPhaseResult | null;
  oddsComparison: OddsComparisonPhaseResult | null;
};

let lastStatus: ShadowSyncStatus = {
  lastRunAt: null,
  lastRunOk: true,
  lastError: null,
  matching: null,
  oddsComparison: null,
};

/** Read-only snapshot of the most recent round — what the admin status
 * endpoint (GET /api/admin/pulsescore-status) reports. */
export function getPulseScoreShadowSyncStatus(): ShadowSyncStatus {
  return lastStatus;
}

export type PrematchSyncStatus = {
  lastRunAt: number | null;
  lastRunOk: boolean;
  lastError: string | null;
  lastCounts: { processed: number; matched: number; priced: number } | null;
  pricedFixtureIdsSize: number;
  cacheMapSize: number;
};
let lastPrematchStatus: PrematchSyncStatus = {
  lastRunAt: null,
  lastRunOk: true,
  lastError: null,
  lastCounts: null,
  pricedFixtureIdsSize: 0,
  cacheMapSize: 0,
};
export function getPulseScorePrematchStatus(): PrematchSyncStatus {
  return {
    ...lastPrematchStatus,
    pricedFixtureIdsSize: prematchMatchedFixtureIds.size,
    cacheMapSize: upcomingPrematchPulsePrices.size,
  };
}
function updatePrematchStatus(partial: Partial<PrematchSyncStatus>): void {
  lastPrematchStatus = { ...lastPrematchStatus, ...partial };
}

/** Exported for direct testability (bypasses the in-flight guard below,
 * same reason canonicalMatchCatalog.ts exports ensureCanonicalMatch
 * alongside its own throttled wrapper). */
export async function runOnce(): Promise<void> {
  try {
    const [unmatched, matchedFixtures] = await Promise.all([
      getUnmatchedGoalApiFootballMatches(PROVIDER),
      getMatchedLiveFootballFixtures(PROVIDER),
    ]);
    if (unmatched.length === 0 && matchedFixtures.length === 0) {
      logger.debug("[pulsescore-shadow] nothing to match or compare — skipping fetch");
      lastStatus = { lastRunAt: Date.now(), lastRunOk: true, lastError: null, matching: null, oddsComparison: null };
      return;
    }

    const candidates = await fetchLivePulseScoreCandidates();

    const matching = unmatched.length > 0 ? await runMatchingPhase(unmatched, candidates) : null;
    const oddsComparison =
      matchedFixtures.length > 0 ? await runOddsComparisonPhase(matchedFixtures, candidates) : null;

    lastStatus = { lastRunAt: Date.now(), lastRunOk: true, lastError: null, matching, oddsComparison };
  } catch (err) {
    lastStatus = {
      lastRunAt: Date.now(),
      lastRunOk: false,
      lastError: err instanceof Error ? err.message : String(err),
      matching: null,
      oddsComparison: null,
    };
    throw err;
  }
}

// ── PREMATCH (Upcoming) Phase ────────────────────────────────────────────────
//
// After the 2026-09-10 "every oddity (prematch + live) must come from
// PulseScore" decision, we extend the shadow-sync to upcoming football
// fixtures: paginate PulseScore's pre-match /soccer/events (currently ~3450
// events across ~690 pages at limit=5, per the user's response samples,
// so we cap pagination at MAX_PREMATCH_PAGES and match only against the
// GOAL-API fixtures already present in upcomingMatches (no need to pull
// the whole planet — we only care about games BET62 already shows).
//
// The upcoming round follows EXACTLY the same two-phase pattern as LIVE:
//   1. Matching  → attachProviderMapping(goalapiProviderMatchId ↔ pulsescore eventId)
//   2. Odds write → inject PulseScore markets directly into UpcomingMatch
//      via an in-memory Map (upcomingPrematchPulsePrices) that
//      buildFootballUpcomingFromGoalApi() reads right after building the
//      base UpcomingMatch row. Same `_priceSource === "pulsescore"` rule
//      as live.

const MAX_PREMATCH_PAGES = 80;
export type PrematchPulsePrice = {
  odds: { home: number; draw: number; away: number };
  markets: Markets;
  pulseScoreEventId: string;
};
const upcomingPrematchPulsePrices: Map<string, PrematchPulsePrice> = new Map();
export function getPrematchPulsePrice(goalApiProviderMatchId: string | number): PrematchPulsePrice | undefined {
  return upcomingPrematchPulsePrices.get(String(goalApiProviderMatchId));
}
const prematchMatchedFixtureIds: Set<string> = new Set();
export function getPrematchPulseScorePricedFixtureIds(): Set<string> {
  return prematchMatchedFixtureIds;
}

async function fetchPrematchPulseScoreCandidates(): Promise<PulseScoreEvent[]> {
  const candidates: PulseScoreEvent[] = [];
  let page = 1;
  for (; page <= MAX_PREMATCH_PAGES; page++) {
    let attempt = 0;
    while (true) {
      try {
        const resp = await pulseScore.getSoccerEvents({ page, limit: 50 });
        for (const ev of resp.events) {
          if (isVirtualPulseScoreLeague(ev.league)) continue;
          candidates.push(ev);
        }
        if (!resp.hasNextPage) return candidates;
        break;
      } catch (err: any) {
        const msg = err?.message ?? "";
        const is429 =
          msg.includes("429") ||
          msg.includes("Too many requests") ||
          msg.includes("rate limit");
        attempt++;
        if (is429 && attempt <= 3) {
          const waitMs = attempt === 1 ? 5000 : attempt === 2 ? 12000 : 30000;
          logger.warn(
            { page, attempt, waitMs, msg: msg.slice(0, 180) },
            "[pulsescore-prematch] HTTP 429 — aguardando retry",
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 1050));
  }
  return candidates;
}

type PrematchGoalApiFixture = {
  providerMatchId: string;
  home: string;
  away: string;
  leagueName: string;
  kickoffUtc: Date | null;
};

/** Matches a list of upcoming GOAL-API fixtures already built by the
 *  upcoming builder against PulseScore's pre-match catalog, then injects
 *  real PulseScore markets directly into the in-memory Map the upcoming
 *  builder reads. Returns a quick status summary so the caller can log
 *  what matched / what didn't without wading through the full debug log. */
export async function runPrematchPulseScoreSync(goalApiFixtures: PrematchGoalApiFixture[]): Promise<{
  processed: number;
  matched: number;
  priced: number;
}> {
  if (!CONFIG.PULSESCORE_API_KEY) {
    updatePrematchStatus({ lastRunAt: Date.now(), lastRunOk: true, lastError: null, lastCounts: { processed: 0, matched: 0, priced: 0 } });
    return { processed: 0, matched: 0, priced: 0 };
  }
  if (goalApiFixtures.length === 0) {
    updatePrematchStatus({ lastRunAt: Date.now(), lastRunOk: true, lastError: null, lastCounts: { processed: 0, matched: 0, priced: 0 } });
    return { processed: 0, matched: 0, priced: 0 };
  }

  const startedAt = Date.now();
  try {
    const candidates = await fetchPrematchPulseScoreCandidates();
    let matched = 0;
    let priced = 0;

    for (const gx of goalApiFixtures) {
    const ref: GoalApiFixtureRef = {
      id: gx.providerMatchId,
      homeTeamName: gx.home,
      awayTeamName: gx.away,
      leagueName: gx.leagueName,
      kickoffUtc: gx.kickoffUtc ? gx.kickoffUtc.toISOString() : null,
    };

    const existingMatched = await getMatchedLiveFootballFixtures(PROVIDER);
    const prior = existingMatched.find((m) => m.goalApiProviderMatchId === gx.providerMatchId);
    let pulseMatchId = prior?.otherProviderMatchId;
    let confidence: number | null = prior?.otherProviderConfidence ?? null;

    if (!pulseMatchId) {
      const candidate = matchGoalApiFixtureToPulseScore(ref, candidates);
      if (candidate) {
        pulseMatchId = candidate.pulseScoreEventId;
        confidence = candidate.confidence;
        try {
          const canonicalId = await ensureCanonicalMatch({
            sport: "football",
            provider: "goalapi",
            providerMatchId: gx.providerMatchId,
            home: gx.home,
            away: gx.away,
            leagueName: gx.leagueName ?? null,
            kickoffUtc: gx.kickoffUtc ?? null,
            status: "scheduled",
          });
          if (canonicalId != null) {
            await attachProviderMapping({
              matchId: canonicalId,
              provider: PROVIDER,
              providerSport: PROVIDER_SPORT,
              providerMatchId: pulseMatchId,
              home: gx.home,
              away: gx.away,
              confidence: typeof confidence === "number" ? confidence : 1,
            });
          }
          matched++;
        } catch (_err) {
          // Mapping already exists from a parallel run — swallow, keep going.
        }
      }
    } else {
      matched++;
    }

    if (!pulseMatchId) continue;

    const ev = candidates.find((c) => c.eventId === pulseMatchId);
    if (!ev) continue;

    const normalized = normalizePulseScoreEvent(ev);
    const mr = normalized.matchResult;
    const all1x2LegsReal = mr
      && Number.isFinite(mr.home) && mr.home > 1
      && Number.isFinite(mr.draw) && mr.draw > 1
      && Number.isFinite(mr.away) && mr.away > 1;
    if (!all1x2LegsReal) continue;

    const newOdds = { home: mr.home, draw: mr.draw, away: mr.away };
    const newMarkets = buildPulseScoreMarkets(normalized);
    upcomingPrematchPulsePrices.set(String(gx.providerMatchId), {
      odds: newOdds,
      markets: newMarkets,
      pulseScoreEventId: pulseMatchId,
    });
    prematchMatchedFixtureIds.add(String(gx.providerMatchId));
    priced++;
  }
    const counts = { processed: goalApiFixtures.length, matched, priced };
    updatePrematchStatus({ lastRunAt: startedAt, lastRunOk: true, lastError: null, lastCounts: counts });
    return counts;
  } catch (err: any) {
    updatePrematchStatus({ lastRunAt: startedAt, lastRunOk: false, lastError: err?.message ?? String(err), lastCounts: null });
    throw err;
  }
}

// Separate runOnce wrapper for prematch — distinct from the live one so
// they can run at different cadences (3min prematch vs 15s live).
let prematchInFlight: Promise<any> | null = null;
export function triggerPrematchPulseScoreSync(goalApiFixtures: PrematchGoalApiFixture[]): Promise<{
  processed: number;
  matched: number;
  priced: number;
}> {
  if (prematchInFlight) return prematchInFlight;
  prematchInFlight = runPrematchPulseScoreSync(goalApiFixtures)
    .catch((err) => {
      logger.error({ err }, "[pulsescore-shadow-prematch] sync failed");
      return { processed: 0, matched: 0, priced: 0 };
    })
    .finally(() => {
      prematchInFlight = null;
    });
  return prematchInFlight;
}

let syncInFlight: Promise<void> | null = null;

/** Fire-and-forget — call on a timer (see api/index.ts). Only an in-flight
 * guard here, not a time-based throttle too: this is called from exactly
 * one setInterval, so the caller already fixes the cadence; the guard just
 * stops the next tick from overlapping a still-running round. */
export function runPulseScoreShadowMatchSync(): void {
  if (syncInFlight) return;
  syncInFlight = runOnce()
    .catch((err) => logger.error({ err }, "[pulsescore-shadow-match] sync failed"))
    .finally(() => {
      syncInFlight = null;
    });
}
