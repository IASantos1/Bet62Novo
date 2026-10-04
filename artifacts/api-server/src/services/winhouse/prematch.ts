import { logger } from "../../lib/logger.js";

// Same domain the sportsbook iframe itself loads client-side
// (components/WinHouseSportsbookEmbed.tsx) — /ajax/prematchgame/:gameId is
// the endpoint the iframe's own JS calls to fetch a single prematch game's
// markets/odds. Step 1 of the Telegram live-odds feature (2026-10-04):
// just prove the backend can query it reliably, nothing else — no
// WebSocket, no reproducing the iframe's internals.
const WINHOUSE_IFRAME_BASE_URL = "https://iframe.winhouse.bet";

// Shape not fully confirmed yet — this is exactly what step 1 (the test
// route) is for. Returned as-is rather than mapped to a narrower type until
// a real response has been inspected.
export async function getWinHouseGame(gameId: string): Promise<unknown> {
  const url = `${WINHOUSE_IFRAME_BASE_URL}/ajax/prematchgame/${encodeURIComponent(gameId)}?lang=pt`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) {
    logger.error({ status: resp.status, gameId }, "WinHouse prematchgame query failed");
    throw Object.assign(new Error(`WinHouse respondeu HTTP ${resp.status}`), { status: 502 });
  }
  return resp.json();
}
