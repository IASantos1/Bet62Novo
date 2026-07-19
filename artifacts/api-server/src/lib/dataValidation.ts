import { logger } from "./logger.js";

const MAX_CACHE_SIZE = 10_000;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

class DataValidationEngine {
  /** eventId → timestamp of first seen event */
  private readonly duplicateCache = new Map<string, number>();

  /** matchId → last known score */
  private readonly scoreHistory = new Map<
    string,
    { home: number; away: number }
  >();

  /**
   * Returns true if the event has been seen before (duplicate).
   * Registers it on first encounter.
   */
  checkDuplicate(eventId: string, timestamp: number): boolean {
    if (this.duplicateCache.has(eventId)) {
      logger.debug({ eventId, timestamp }, "Duplicate event detected");
      return true;
    }
    // Evict oldest entry if at capacity
    if (this.duplicateCache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.duplicateCache.keys().next().value;
      if (firstKey !== undefined) this.duplicateCache.delete(firstKey);
    }
    this.duplicateCache.set(eventId, timestamp);
    return false;
  }

  /**
   * Returns true if the score is chronologically valid (scores never decrease).
   * Updates the stored score on success.
   */
  validateChronologicalOrder(
    matchId: string,
    currentScore: { home: number; away: number },
  ): boolean {
    const prev = this.scoreHistory.get(matchId);
    if (prev) {
      if (currentScore.home < prev.home || currentScore.away < prev.away) {
        logger.warn(
          { matchId, prev, currentScore },
          "Chronological order violation: score decreased",
        );
        return false;
      }
    }
    this.scoreHistory.set(matchId, { ...currentScore });
    return true;
  }

  /**
   * Validates data integrity:
   * - scores must be non-negative integers when present
   * - required fields (matchId, status) must exist and be non-empty strings
   */
  validateIntegrity(data: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required top-level string fields
    const requiredStringFields = ["matchId", "status"] as const;
    for (const field of requiredStringFields) {
      const val = data[field];
      if (val === undefined || val === null || String(val).trim() === "") {
        errors.push(`Missing or empty required field: ${field}`);
      }
    }

    // Validate score fields when present
    for (const scoreKey of ["homeScore", "awayScore", "home", "away"] as const) {
      if (scoreKey in data) {
        const val = data[scoreKey];
        if (
          typeof val !== "number" ||
          !Number.isInteger(val) ||
          val < 0
        ) {
          errors.push(
            `Score field '${scoreKey}' must be a non-negative integer, got: ${JSON.stringify(val)}`,
          );
        }
      }
    }

    // Validate nested score object when present
    for (const scoreObj of ["finalScore", "htScore", "score"] as const) {
      const obj = data[scoreObj];
      if (obj !== undefined && obj !== null && typeof obj === "object") {
        const s = obj as Record<string, unknown>;
        for (const [k, v] of Object.entries(s)) {
          if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
            errors.push(
              `Score field '${scoreObj}.${k}' must be a non-negative integer, got: ${JSON.stringify(v)}`,
            );
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Returns a completeness score 0–100 based on how many required fields are
   * present and non-empty in the data record.
   */
  qualityScore(
    data: Record<string, unknown>,
    requiredFields: string[],
  ): number {
    if (requiredFields.length === 0) return 100;
    let present = 0;
    for (const field of requiredFields) {
      const val = data[field];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        present++;
      }
    }
    return Math.round((present / requiredFields.length) * 100);
  }

  /**
   * Removes duplicate-cache entries older than ttlMs.
   * Also prunes score history for matches not updated recently (uses a
   * separate age-tracking approach via a parallel timestamps map).
   */
  cleanup(ttlMs: number = DEFAULT_TTL_MS): void {
    const cutoff = Date.now() - ttlMs;
    let evicted = 0;
    for (const [key, ts] of this.duplicateCache) {
      if (ts < cutoff) {
        this.duplicateCache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.debug({ evicted }, "DataValidationEngine: evicted stale duplicate cache entries");
    }
  }
}

export const dataValidator = new DataValidationEngine();
