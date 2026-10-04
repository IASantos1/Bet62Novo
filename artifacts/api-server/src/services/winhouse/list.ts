import { logger } from "../../lib/logger.js";

// Same domain as prematch.ts — /ajax/prematchgames24hour lists every game
// (any sport) kicking off in the next 24h, each with its own odds already
// embedded in a compact "odd"/"ímpar" string field. Confirmed from a real
// response (2026-10-04): field names are inconsistent — some games use
// English keys (id/home_team/away_team/odd/game_date/country/league/
// sport_id/count_options), others use the Portuguese-translated variant
// (time_casa/time_visitante/ímpar/data_jogo/país/liga/id_esporte/
// opções_contagem) — this looks like a bug on WinHouse's side, not tied to
// any particular sport or league, so callers must accept both.
const WINHOUSE_IFRAME_BASE_URL = "https://iframe.winhouse.bet";

export async function getWinHouse24hGames(): Promise<unknown> {
  const url = `${WINHOUSE_IFRAME_BASE_URL}/ajax/prematchgames24hour?lang=pt`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    logger.error({ status: resp.status }, "WinHouse prematchgames24hour query failed");
    throw Object.assign(new Error(`WinHouse respondeu HTTP ${resp.status}`), { status: 502 });
  }
  return resp.json();
}
