// BET62 Fase 0 (hybrid GOAL API + PulseScore architecture, 2026-09-10) —
// football market suspension, extracted verbatim from
// buildFootballLiveFromGoalApi (routes/matches.ts) into its own testable
// module. Same rules, same behavior — goal/red-card tiers via
// footballSuspensionDelayMs (lib/config.ts) — just isolated instead of
// inlined inside the GOAL API builder, so a future second provider's
// builder can call the same engine instead of re-deriving the rules.
//
// One new trigger added on top of the existing two: FEED_STALE. Not an
// "odds are wrong" signal — football's live price is BET62's own Poisson
// model (calculateLiveFootballMarkets), continuously recomputed from the
// latest known score regardless of provider odds freshness, so a stale
// provider quote doesn't by itself make the displayed price wrong. What it
// DOES mean: GOAL API hasn't confirmed a real odds quote for this fixture
// in a while, which is worth a conservative pause — a real provider
// outage/delisting for this specific market look identical to "quiet
// match", and this is cheap insurance against the rare case where it's
// the former.
import { FOOTBALL_SUSP_KEYS, footballSuspensionDelayMs } from "../lib/config.js";

export type FootballSuspensionInput = {
  now: number;
  existingSuspension?: Record<string, number>;
  existingReason?: string;
  newRedCard: boolean;
  goalScored: boolean;
  /** ms since the last time a real odds quote was accepted from the
   * provider for this fixture — undefined if never seen yet. */
  oddsAgeMs?: number;
};

export type FootballSuspensionResult = {
  marketSuspension?: Record<string, number>;
  suspensionReason?: string;
};

/** How long with no real provider odds quote before treating the feed as
 * stale for this fixture — generous on purpose (provider odds refresh
 * slower than score, per GoalApiClient.getFixtureLiveOdds's own docs
 * comment: ~2 min even on a healthy feed), so this only fires on genuine
 * prolonged silence, not normal poll cadence. */
const FOOTBALL_ODDS_FEED_STALE_MS = 5 * 60_000;

export function computeFootballMarketSuspension(
  input: FootballSuspensionInput,
): FootballSuspensionResult {
  let marketSuspension: Record<string, number> | undefined = input.existingSuspension
    ? { ...input.existingSuspension }
    : undefined;
  if (marketSuspension) {
    const active = Object.fromEntries(
      Object.entries(marketSuspension).filter(([, ts]) => ts > input.now),
    );
    marketSuspension = Object.keys(active).length > 0 ? active : undefined;
  }
  let suspensionReason = marketSuspension ? input.existingReason : undefined;

  if (input.newRedCard) {
    marketSuspension = Object.fromEntries(
      FOOTBALL_SUSP_KEYS.map((k) => [k, input.now + footballSuspensionDelayMs("var", k)]),
    );
    suspensionReason = "CARTÃO VERMELHO!";
  } else if (input.goalScored) {
    marketSuspension = Object.fromEntries(
      FOOTBALL_SUSP_KEYS.map((k) => [k, input.now + footballSuspensionDelayMs("goal", k)]),
    );
    suspensionReason = "GOL!";
  } else if (
    !marketSuspension &&
    input.oddsAgeMs != null &&
    input.oddsAgeMs > FOOTBALL_ODDS_FEED_STALE_MS
  ) {
    marketSuspension = Object.fromEntries(
      FOOTBALL_SUSP_KEYS.map((k) => [k, input.now + footballSuspensionDelayMs("goal", k)]),
    );
    suspensionReason = "FEED SEM ATUALIZAÇÃO";
  }

  return { marketSuspension, suspensionReason };
}
