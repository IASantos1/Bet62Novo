export const CONFIG = {
  LIVE_UPDATE_INTERVAL: 2000,
  PREMATCH_UPDATE_INTERVAL: 300_000,
  REOPEN_DELAY_GOAL: 8000,
  REOPEN_DELAY_VAR: 15_000,
  MAX_ODDS_DRIFT: 0.40,
  CACHE_TTL: 86_400,

  LIVE_CACHE_TTL: 15_000,
  DAILY_CACHE_TTL: 300_000,
  TOMORROW_CACHE_TTL: 1_800_000,
  ODDS_CACHE_TTL: 300_000,
} as const;

export const CRITICAL_EVENTS = ["goal", "var", "red_card", "penalty", "touchdown"] as const;

export type CriticalEvent = typeof CRITICAL_EVENTS[number];

export function shouldSuspend(eventType: string): boolean {
  return (CRITICAL_EVENTS as readonly string[]).includes(eventType);
}

export function detectOddsDrift(oldOdd: number, newOdd: number): boolean {
  return Math.abs(newOdd - oldOdd) > CONFIG.MAX_ODDS_DRIFT;
}
