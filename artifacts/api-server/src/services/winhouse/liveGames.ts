import { logger } from "../../lib/logger.js";

// Same domain as list.ts/prematch.ts. Shape NOT confirmed against a real
// response yet (2026-10-05) — this session's sandbox has no outbound
// network access to iframe.winhouse.bet to verify it directly, and the
// field names the user described from their own manual test
// (id/result/current_minute/odd) are their own paraphrase, not a captured
// payload. See liveGame.ts's normalizer for how this is handled without
// guessing: GET /api/winhouse/live-games (added alongside this) dumps the
// raw response so the real field names can be confirmed from production
// before anything downstream is tightened to assume them.
const WINHOUSE_IFRAME_BASE_URL = "https://iframe.winhouse.bet";

export async function getWinHouseLiveGames(): Promise<unknown> {
  const url = `${WINHOUSE_IFRAME_BASE_URL}/ajax/livegames?lang=pt`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    logger.error({ status: resp.status }, "WinHouse livegames query failed");
    throw Object.assign(new Error(`WinHouse respondeu HTTP ${resp.status}`), { status: 502 });
  }
  return resp.json();
}
