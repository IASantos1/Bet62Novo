export const CONFIG = {
  LIVE_UPDATE_INTERVAL: 1000,
  PREMATCH_UPDATE_INTERVAL: 300_000,
  REOPEN_DELAY_GOAL: 25_000,
  REOPEN_DELAY_VAR: 45_000,
  MAX_ODDS_DRIFT: 0.40,
  CACHE_TTL: 86_400,

  LIVE_CACHE_TTL: 2_000,
  DAILY_CACHE_TTL: 300_000,
  TOMORROW_CACHE_TTL: 1_800_000,
  ODDS_CACHE_TTL: 300_000,
} as const;

export const CRITICAL_EVENTS = ["goal", "var", "red_card", "penalty", "touchdown"] as const;

export type CriticalEvent = typeof CRITICAL_EVENTS[number];

export const FOOTBALL_SUSP_KEYS_GOAL = [
  "result",
  "doubleChance",
  "totalGoals",
  "handicap",
  "halfTime",
  "htft",
  "correctScore",
  "asianHandicap",
  "asianTotals",
  "drawNoBet",
  "firstGoal",
  "winToNil",
  "cleanSheet",
  "goalOddEven",
  "exactGoals",
  "btts1H",
  "btts2H",
  "toWinBothHalves",
  "highestScoringHalf",
  "htCorrectScore",
  "h2CorrectScore",
  "teamGoals",
  "secondHalf",
  "drawNoBet2",
  "handicapPoints",
] as const;

export const FOOTBALL_SUSP_KEYS_VAR = [
  "result",
  "doubleChance",
  "totalGoals",
  "handicap",
  "halfTime",
  "correctScore",
  "asianHandicap",
  "asianTotals",
  "drawNoBet",
  "firstGoal",
  "htft",
  "winToNil",
  "cleanSheet",
  "goalOddEven",
  "exactGoals",
  "btts1H",
  "toWinBothHalves",
  "highestScoringHalf",
  "htCorrectScore",
  "h2CorrectScore",
  "teamGoals",
  "secondHalf",
  "drawNoBet2",
  "handicapPoints",
] as const;

export type FootballSuspensionKey = typeof FOOTBALL_SUSP_KEYS_GOAL[number] | typeof FOOTBALL_SUSP_KEYS_VAR[number];
export type FootballSuspensionEvent = "goal" | "var";

const FOOTBALL_GOAL_MULT: Record<FootballSuspensionKey, number> = {
  result: 1,
  doubleChance: 1,
  halfTime: 1,
  drawNoBet: 1,
  firstGoal: 1,
  winToNil: 1,
  cleanSheet: 1,
  btts1H: 1,
  btts2H: 1,
  highestScoringHalf: 1,
  secondHalf: 1,
  drawNoBet2: 1,
  totalGoals: 28 / 25,
  handicap: 28 / 25,
  goalOddEven: 28 / 25,
  toWinBothHalves: 28 / 25,
  teamGoals: 28 / 25,
  handicapPoints: 28 / 25,
  htft: 30 / 25,
  asianHandicap: 30 / 25,
  asianTotals: 30 / 25,
  exactGoals: 30 / 25,
  correctScore: 35 / 25,
  htCorrectScore: 35 / 25,
  h2CorrectScore: 35 / 25,
};

const FOOTBALL_VAR_MULT: Record<FootballSuspensionKey, number> = {
  result: 1,
  doubleChance: 1,
  halfTime: 1,
  drawNoBet: 1,
  firstGoal: 1,
  winToNil: 1,
  cleanSheet: 1,
  btts1H: 1,
  btts2H: 1,
  highestScoringHalf: 1,
  secondHalf: 1,
  drawNoBet2: 1,
  totalGoals: 50 / 45,
  handicap: 50 / 45,
  goalOddEven: 50 / 45,
  toWinBothHalves: 50 / 45,
  teamGoals: 50 / 45,
  handicapPoints: 50 / 45,
  asianHandicap: 55 / 45,
  asianTotals: 55 / 45,
  exactGoals: 55 / 45,
  htft: 60 / 45,
  correctScore: 60 / 45,
  htCorrectScore: 60 / 45,
  h2CorrectScore: 60 / 45,
};

export function footballSuspensionDelayMs(event: FootballSuspensionEvent, marketKey: FootballSuspensionKey): number {
  const base = event === "goal" ? CONFIG.REOPEN_DELAY_GOAL : CONFIG.REOPEN_DELAY_VAR;
  const mult = event === "goal" ? FOOTBALL_GOAL_MULT[marketKey] : FOOTBALL_VAR_MULT[marketKey];
  const ms = Math.round(base * mult);
  return Number.isFinite(ms) && ms > 0 ? ms : base;
}

export function shouldSuspend(eventType: string): boolean {
  return (CRITICAL_EVENTS as readonly string[]).includes(eventType);
}

export function detectOddsDrift(oldOdd: number, newOdd: number): boolean {
  return Math.abs(newOdd - oldOdd) > CONFIG.MAX_ODDS_DRIFT;
}
