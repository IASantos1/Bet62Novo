import { db } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
// Relative import — same tsc alias-resolution convention already used for
// telegramPostsTable/affiliatesTable elsewhere in routes/*.ts.
import { winhousePromotionPostsTable } from "../../../../../lib/db/src/schema/winhousePromotionPosts.js";
import { logger } from "../../lib/logger.js";
import { isTelegramConfigured, sendTelegramMessage } from "../../lib/telegram/client.js";
import { getWinHouse24hGames } from "./list.js";
import { normalizeListGame, type NormalizedListGame } from "./listGame.js";
import { filterWinHouseListGame } from "./leagueFilter.js";
import { getWinHouseGame } from "./prematch.js";
import { parseWinHouseGame } from "./parser.js";
import { formatWinHouseFootballTicket } from "./telegramFormat.js";

const FOOTBALL_SPORT = "futebol";

// User-confirmed (2026-10-05): space consecutive Telegram promotions out so
// the channel doesn't get flooded with every qualifying game at once.
// Overridable for testing; the default is the agreed value.
function getMinGapMs(): number {
  const raw = process.env["WINHOUSE_PROMO_MIN_GAP_MS"];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 60_000 ? n : 10 * 60 * 1000;
}

function buildCtaUrl(): string | undefined {
  const raw = process.env["PUBLIC_SITE_URL"]?.trim();
  if (!raw) return undefined;
  return `${raw.replace(/\/+$/, "")}/sportsbook`;
}

export type WinHousePromotionTickResult =
  | { action: "skipped"; reason: "telegram_not_configured" | "too_soon" | "no_candidates" | "bad_response" }
  | { action: "posted"; gameId: string; status: "sent" | "failed" };

async function recordAttempt(args: {
  game: NormalizedListGame;
  tier: "grande" | "média";
  status: "sent" | "failed";
  telegramMessageId?: string | null;
  error?: string | null;
}): Promise<void> {
  await db.insert(winhousePromotionPostsTable).values({
    gameId: args.game.gameId,
    sport: FOOTBALL_SPORT,
    league: args.game.league,
    tier: args.tier,
    homeTeam: args.game.homeTeam,
    awayTeam: args.game.awayTeam,
    kickoffAt: args.game.gameDate,
    status: args.status,
    telegramMessageId: args.telegramMessageId ?? null,
    error: args.error ?? null,
  });
}

// One tick: if enough time has passed since the last successful post, picks
// the soonest-kickoff qualifying fixture that hasn't been posted yet, sends
// it to Telegram, and records the outcome. At most one post per call —
// the caller's own polling interval plus this gap check is what spaces
// posts out, not a batch send.
export async function runWinHousePromotionTick(): Promise<WinHousePromotionTickResult> {
  if (!isTelegramConfigured()) {
    return { action: "skipped", reason: "telegram_not_configured" };
  }

  const [lastSent] = await db
    .select({ createdAt: winhousePromotionPostsTable.createdAt })
    .from(winhousePromotionPostsTable)
    .where(eq(winhousePromotionPostsTable.status, "sent"))
    .orderBy(desc(winhousePromotionPostsTable.createdAt))
    .limit(1);

  if (lastSent && Date.now() - lastSent.createdAt.getTime() < getMinGapMs()) {
    return { action: "skipped", reason: "too_soon" };
  }

  const alreadySent = await db
    .select({ gameId: winhousePromotionPostsTable.gameId })
    .from(winhousePromotionPostsTable)
    .where(eq(winhousePromotionPostsTable.status, "sent"));
  const sentGameIds = new Set(alreadySent.map((row) => row.gameId));

  const raw = await getWinHouse24hGames();
  if (!Array.isArray(raw)) {
    return { action: "skipped", reason: "bad_response" };
  }

  const candidates: Array<{ game: NormalizedListGame; tier: "grande" | "média" }> = [];
  for (const entry of raw) {
    const game = normalizeListGame(entry);
    if (!game || sentGameIds.has(game.gameId)) continue;
    const result = filterWinHouseListGame(game);
    if (result.status === "included") {
      candidates.push({ game, tier: result.tier });
    }
  }

  if (candidates.length === 0) {
    return { action: "skipped", reason: "no_candidates" };
  }

  // "YYYY-MM-DD HH:mm:ss" sorts correctly under plain ASCII comparison — no
  // timezone parsing needed, soonest kickoff first. Plain < / > rather than
  // localeCompare, so this never depends on the server's locale.
  candidates.sort((a, b) => (a.game.gameDate < b.game.gameDate ? -1 : a.game.gameDate > b.game.gameDate ? 1 : 0));
  const next = candidates[0]!;

  const rawGame = await getWinHouseGame(next.game.gameId);
  const parsed = parseWinHouseGame(rawGame, next.game.gameId);
  if (!parsed) {
    logger.warn({ gameId: next.game.gameId }, "[winhousePromo] 1x2 market not found, recording as failed");
    await recordAttempt({ game: next.game, tier: next.tier, status: "failed", error: "Mercado 1X2 não encontrado" });
    return { action: "posted", gameId: next.game.gameId, status: "failed" };
  }

  const html = formatWinHouseFootballTicket(parsed);
  const result = await sendTelegramMessage({
    html,
    ctaText: "APOSTAR AGORA",
    ctaUrl: buildCtaUrl(),
  });

  await recordAttempt({
    game: next.game,
    tier: next.tier,
    status: result.status,
    telegramMessageId: result.status === "sent" ? result.messageId : null,
    error: result.status === "failed" ? result.error : null,
  });

  if (result.status === "failed") {
    logger.error({ gameId: next.game.gameId, error: result.error }, "[winhousePromo] Telegram send failed");
  } else {
    logger.info({ gameId: next.game.gameId, tier: next.tier }, "[winhousePromo] posted to Telegram");
  }

  return { action: "posted", gameId: next.game.gameId, status: result.status };
}
