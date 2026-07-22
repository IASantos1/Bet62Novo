import { logger } from "./logger.js";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "suspended"
  | "finished"
  | "cancelled"
  | "postponed";

export type MatchState = {
  matchId: string;
  sport?: string;
  status: MatchStatus;
  /** FT / regular-time score */
  homeScore: number;
  awayScore: number;
  /** Half-time score (football/hockey) */
  htHomeScore?: number;
  htAwayScore?: number;
  /** Match clock in minutes (football, basketball) or inning/set number */
  minute?: number;
  /** Display clock string e.g. "45+2", "Q3 08:34", "Top 7th" */
  clockStr?: string;
  /** Period/phase label e.g. "1H", "HT", "Q2", "OT", "S3" */
  period?: string;
  suspendedAt?: Date;
  suspendedReason?: string;
  lastUpdated: Date;
};

const MAX_STATES = 20_000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class MatchStateEngine {
  private readonly states = new Map<string, MatchState>();

  /** Update or create state for a match. Returns the merged state. */
  updateState(matchId: string, update: Partial<MatchState>): MatchState {
    const existing = this.states.get(matchId);
    const next: MatchState = {
      matchId,
      status: "scheduled",
      homeScore: 0,
      awayScore: 0,
      ...existing,
      ...update,
      lastUpdated: new Date(),
    };
    // Ensure matchId is always authoritative (not overridden by update spread)
    next.matchId = matchId;

    if (!this.states.has(matchId) && this.states.size >= MAX_STATES) {
      // Evict oldest entry
      const firstKey = this.states.keys().next().value;
      if (firstKey !== undefined) this.states.delete(firstKey);
    }

    this.states.set(matchId, next);
    return next;
  }

  /** Get current state for a match, or undefined if unknown. */
  getState(matchId: string): MatchState | undefined {
    return this.states.get(matchId);
  }

  /** Mark a match as suspended (blocks new bets). */
  suspend(matchId: string, reason: string): void {
    const existing = this.states.get(matchId);
    const next: MatchState = {
      matchId,
      homeScore: 0,
      awayScore: 0,
      ...existing,
      status: "suspended",
      suspendedAt: new Date(),
      suspendedReason: reason,
      lastUpdated: new Date(),
    };
    this.states.set(matchId, next);
    logger.info({ matchId, reason }, "MatchStateEngine: match suspended");
  }

  /** Lift suspension and restore previous live status (or 'live' by default). */
  unsuspend(matchId: string): void {
    const existing = this.states.get(matchId);
    if (!existing) {
      logger.warn({ matchId }, "MatchStateEngine: unsuspend called on unknown match");
      return;
    }
    const next: MatchState = {
      ...existing,
      status: "live",
      suspendedAt: undefined,
      suspendedReason: undefined,
      lastUpdated: new Date(),
    };
    this.states.set(matchId, next);
    logger.info({ matchId }, "MatchStateEngine: match unsuspended");
  }

  /** Returns true if the match is currently suspended. */
  isSuspended(matchId: string): boolean {
    return this.states.get(matchId)?.status === "suspended";
  }

  /** Returns all matches whose status is 'live'. */
  getLiveMatches(): MatchState[] {
    const result: MatchState[] = [];
    for (const state of this.states.values()) {
      if (state.status === "live") result.push(state);
    }
    return result;
  }

  /** Returns all matches for a given sport. */
  getMatchesBySport(sport: string): MatchState[] {
    const result: MatchState[] = [];
    for (const state of this.states.values()) {
      if (state.sport === sport) result.push(state);
    }
    return result;
  }

  /**
   * Convenience: update only the live score + clock.
   * Use this from feed ingestion instead of calling updateState with full payload.
   */
  updateScore(
    matchId: string,
    homeScore: number,
    awayScore: number,
    opts?: { minute?: number; clockStr?: string; period?: string; sport?: string },
  ): MatchState {
    return this.updateState(matchId, {
      homeScore,
      awayScore,
      ...opts,
      status: "live",
    });
  }

  /**
   * Mark a match as finished with final score.
   * Keeps the state for 24 h for post-match lookups.
   */
  finishMatch(
    matchId: string,
    homeScore: number,
    awayScore: number,
    opts?: { htHomeScore?: number; htAwayScore?: number; sport?: string },
  ): MatchState {
    return this.updateState(matchId, {
      homeScore,
      awayScore,
      status: "finished",
      minute: undefined,
      clockStr: undefined,
      ...opts,
    });
  }

  /**
   * Normalizes a raw status string from various feed providers into an
   * internal MatchStatus value.
   */
  normalizeStatus(raw: string): MatchStatus {
    const s = raw.toLowerCase().trim();

    if (
      s === "live" ||
      s === "inprogress" ||
      s === "in_progress" ||
      s === "in progress" ||
      s === "playing" ||
      s === "ongoing" ||
      s === "1h" ||
      s === "2h" ||
      s === "et" ||
      s === "ot" ||
      s === "overtime" ||
      s === "q1" || s === "q2" || s === "q3" || s === "q4" ||
      s === "1p" || s === "2p" || s === "3p" ||
      s.startsWith("top ") || s.startsWith("bottom ")  // MLB innings
    ) {
      return "live";
    }

    if (s === "ht" || s === "halftime" || s === "half_time" || s === "half time" || s === "break") {
      return "halftime";
    }

    if (
      s === "finished" ||
      s === "ft" ||
      s === "fulltime" ||
      s === "full_time" ||
      s === "full time" ||
      s === "ended" ||
      s === "complete" ||
      s === "completed" ||
      s === "final" ||
      s === "closed" ||
      s === "aet" ||
      s === "pen" ||
      s === "after ot" ||
      s === "after so" ||
      s === "aot" ||
      s === "game over" ||
      s === "f"
    ) {
      return "finished";
    }

    if (
      s === "cancelled" ||
      s === "canceled" ||
      s === "abandoned" ||
      s === "void"
    ) {
      return "cancelled";
    }

    if (s === "postponed" || s === "delayed") {
      return "postponed";
    }

    if (s === "suspended" || s === "interrupted" || s === "paused") {
      return "suspended";
    }

    if (
      s === "scheduled" ||
      s === "not_started" ||
      s === "not started" ||
      s === "ns" ||
      s === "tbd" ||
      s === "upcoming" ||
      s === "fixture"
    ) {
      return "scheduled";
    }

    logger.debug({ raw }, "MatchStateEngine: unknown status, defaulting to scheduled");
    return "scheduled";
  }

  /** Remove match states that haven't been updated in over 24 hours. */
  cleanup(): void {
    const cutoff = Date.now() - STALE_TTL_MS;
    let evicted = 0;
    for (const [matchId, state] of this.states) {
      if (state.lastUpdated.getTime() < cutoff) {
        this.states.delete(matchId);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.debug({ evicted }, "MatchStateEngine: evicted stale match states");
    }
  }
}

export const matchStateEngine = new MatchStateEngine();
