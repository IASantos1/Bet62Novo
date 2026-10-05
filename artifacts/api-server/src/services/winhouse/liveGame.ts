// Normalizes one entry of /ajax/livegames. Field names are NOT confirmed
// from a real response (see liveGames.ts) — the user's own description of
// their manual test gave "id"/"result"/"current_minute"/"odd" as examples,
// not a captured payload, and list.ts/prematch.ts already proved WinHouse
// is inconsistent between English and Portuguese-translated field names on
// its other endpoints. So every field here is looked up under several
// plausible names (same defensive pattern as listGame.ts's firstString),
// and anything not found is left null rather than guessed — the live
// ticket degrades to just the "AO VIVO" header with no score/minute
// instead of fabricating one. odd/ímpar is deliberately not decoded here:
// the 24h list's own "odd" string has never been decoded anywhere in this
// codebase (the dedicated /ajax/prematchgame/:gameId endpoint is used for
// real odds instead), so there's no confirmed scheme to reuse for the live
// feed's odd field either — live tickets keep the original 1x2 odds the
// message was first sent with, unchanged.
export type NormalizedLiveGame = {
  gameId: string;
  // e.g. "2-1" if found under a recognized key, else null.
  resultRaw: string | null;
  // e.g. "56:21" if found under a recognized key, else null.
  currentMinute: string | null;
};

function firstString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function normalizeLiveGame(raw: unknown): NormalizedLiveGame | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = r["id"] ?? r["game_id"] ?? r["id_jogo"];
  if (typeof id !== "number" && typeof id !== "string") return null;

  return {
    gameId: String(id),
    resultRaw: firstString(r, ["result", "resultado", "placar", "score"]),
    currentMinute: firstString(r, ["current_minute", "minuto_atual", "minuto", "tempo", "tempo_atual"]),
  };
}

// What the live monitor compares tick-to-tick to decide whether to call
// editMessageText — changes only when the fields it actually displays
// change, not on every poll.
export function buildLiveSignature(game: NormalizedLiveGame): string {
  return `${game.resultRaw ?? ""}|${game.currentMinute ?? ""}`;
}

// "2-1" -> {home:2, away:1}. Anything else (unrecognized separator, missing
// field) returns null rather than guessing — callers fall back to the
// row's last known score instead of showing a wrong one.
export function parseScoreline(resultRaw: string | null): { home: number; away: number } | null {
  if (!resultRaw) return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(resultRaw.trim());
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}
