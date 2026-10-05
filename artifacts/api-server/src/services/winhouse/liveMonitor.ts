import { db } from "@workspace/db";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
// Relative import — same convention already used for this table elsewhere
// (promotionScheduler.ts, routes/winhouse.ts).
import { winhousePromotionPostsTable, type WinHousePromotionPostRow } from "../../../../../lib/db/src/schema/winhousePromotionPosts.js";
import { logger } from "../../lib/logger.js";
import { deleteTelegramMessage, editTelegramMessage } from "../../lib/telegram/client.js";
import { getWinHouseLiveGames } from "./liveGames.js";
import { normalizeLiveGame, buildLiveSignature, parseScoreline, type NormalizedLiveGame } from "./liveGame.js";
import { formatWinHouseLiveFootballTicket, formatWinHouseFinishedFootballTicket } from "./telegramFormat.js";

// User-confirmed design (2026-10-05): how many consecutive ticks a game can
// be missing from /ajax/livegames before it's treated as FINISHED rather
// than a momentary feed hiccup. Only counted once a game has actually been
// seen live at least once (status="live") — a "sent" (pré-jogo) row simply
// hasn't kicked off yet, that's not a miss.
function getFinishConfirmMisses(): number {
  const raw = process.env["WINHOUSE_FINISH_CONFIRM_MISSES"];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 3;
}

// User-confirmed design: don't editMessageText on every single poll even
// when the score/minute keeps changing — space edits out by at least this
// much.
function getMinEditGapMs(): number {
  const raw = process.env["WINHOUSE_LIVE_MIN_EDIT_GAP_MS"];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1_000 ? n : 30_000;
}

function getDeleteDelayMs(): number {
  const raw = process.env["TELEGRAM_EVENT_DELETE_DELAY_MS"];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 10_000 ? n : 10 * 60 * 1000;
}

export type LiveMonitorTickResult = {
  activeChecked: number;
  edited: number;
  finished: number;
  deleted: number;
};

async function runDeletes(now: Date): Promise<number> {
  const due = await db
    .select()
    .from(winhousePromotionPostsTable)
    .where(and(eq(winhousePromotionPostsTable.status, "finished"), isNotNull(winhousePromotionPostsTable.deleteAt), lte(winhousePromotionPostsTable.deleteAt, now)));

  let deleted = 0;
  for (const row of due) {
    if (row.telegramMessageId) {
      const result = await deleteTelegramMessage(row.telegramMessageId);
      if (result.status === "failed") {
        logger.error({ gameId: row.gameId, error: result.error }, "[winhouseLiveMonitor] deleteMessage failed");
        continue; // leave status="finished" so this is retried on the next tick
      }
    }
    await db.update(winhousePromotionPostsTable).set({ status: "deleted" }).where(eq(winhousePromotionPostsTable.id, row.id));
    deleted++;
  }
  return deleted;
}

async function transitionToLive(row: WinHousePromotionPostRow, live: NormalizedLiveGame, score: { home: number; away: number } | null, now: Date): Promise<boolean> {
  if (!row.telegramMessageId) {
    logger.warn({ gameId: row.gameId }, "[winhouseLiveMonitor] 'sent' row has no telegram_message_id, can't edit");
    return false;
  }
  const text = formatWinHouseLiveFootballTicket(row, score, live.currentMinute);
  const result = await editTelegramMessage({ messageId: row.telegramMessageId, html: text });
  if (result.status === "failed") {
    logger.error({ gameId: row.gameId, error: result.error }, "[winhouseLiveMonitor] editMessageText (-> live) failed");
    return false;
  }
  await db
    .update(winhousePromotionPostsTable)
    .set({
      status: "live",
      liveMisses: 0,
      lastSignature: buildLiveSignature(live),
      lastEditedAt: now,
      scoreHome: score?.home ?? null,
      scoreAway: score?.away ?? null,
      currentMinute: live.currentMinute,
    })
    .where(eq(winhousePromotionPostsTable.id, row.id));
  return true;
}

async function transitionToFinished(row: WinHousePromotionPostRow, misses: number, now: Date): Promise<boolean> {
  const score = row.scoreHome !== null && row.scoreAway !== null ? { home: row.scoreHome, away: row.scoreAway } : null;
  if (row.telegramMessageId) {
    const text = formatWinHouseFinishedFootballTicket(row, score);
    const result = await editTelegramMessage({ messageId: row.telegramMessageId, html: text, removeKeyboard: true });
    if (result.status === "failed") {
      logger.error({ gameId: row.gameId, error: result.error }, "[winhouseLiveMonitor] editMessageText (-> finished) failed");
      // Still record the miss count so this gets retried next tick instead
      // of looping forever on the same misses value.
      await db.update(winhousePromotionPostsTable).set({ liveMisses: misses }).where(eq(winhousePromotionPostsTable.id, row.id));
      return false;
    }
  }
  await db
    .update(winhousePromotionPostsTable)
    .set({ status: "finished", liveMisses: misses, finishedAt: now, deleteAt: new Date(now.getTime() + getDeleteDelayMs()) })
    .where(eq(winhousePromotionPostsTable.id, row.id));
  return true;
}

async function editLiveUpdate(row: WinHousePromotionPostRow, live: NormalizedLiveGame, score: { home: number; away: number } | null, now: Date): Promise<boolean> {
  if (!row.telegramMessageId) return false;
  const text = formatWinHouseLiveFootballTicket(row, score, live.currentMinute);
  const result = await editTelegramMessage({ messageId: row.telegramMessageId, html: text });
  if (result.status === "failed") {
    logger.error({ gameId: row.gameId, error: result.error }, "[winhouseLiveMonitor] editMessageText (live update) failed");
    return false;
  }
  await db
    .update(winhousePromotionPostsTable)
    .set({
      liveMisses: 0,
      lastSignature: buildLiveSignature(live),
      lastEditedAt: now,
      scoreHome: score?.home ?? null,
      scoreAway: score?.away ?? null,
      currentMinute: live.currentMinute,
    })
    .where(eq(winhousePromotionPostsTable.id, row.id));
  return true;
}

// One tick: (1) delete any FINISHED post whose delay has elapsed, (2) walk
// every "sent"/"live" post and compare it against the current
// /ajax/livegames snapshot to drive PREMATCH -> LIVE -> FINISHED. Only
// edits/deletes the row's own single Telegram message — never sends a new
// one (see promotionScheduler.ts for that).
export async function runWinHouseLiveMonitorTick(): Promise<LiveMonitorTickResult> {
  const now = new Date();
  const deleted = await runDeletes(now);

  const active = await db
    .select()
    .from(winhousePromotionPostsTable)
    .where(inArray(winhousePromotionPostsTable.status, ["sent", "live"]));

  if (active.length === 0) {
    return { activeChecked: 0, edited: 0, finished: 0, deleted };
  }

  const raw = await getWinHouseLiveGames();
  if (!Array.isArray(raw)) {
    logger.warn("[winhouseLiveMonitor] /ajax/livegames returned a non-array response, skipping this tick");
    return { activeChecked: active.length, edited: 0, finished: 0, deleted };
  }

  const liveById = new Map<string, NormalizedLiveGame>();
  for (const entry of raw) {
    const g = normalizeLiveGame(entry);
    if (g) liveById.set(g.gameId, g);
  }

  let edited = 0;
  let finished = 0;
  const minEditGapMs = getMinEditGapMs();
  const finishConfirmMisses = getFinishConfirmMisses();

  for (const row of active) {
    const live = liveById.get(row.gameId);

    if (!live) {
      // "sent" (still pré-jogo, hasn't kicked off / hasn't shown up in the
      // live feed yet) — not a miss, just not live yet.
      if (row.status !== "live") continue;

      const misses = row.liveMisses + 1;
      if (misses >= finishConfirmMisses) {
        if (await transitionToFinished(row, misses, now)) finished++;
      } else {
        await db.update(winhousePromotionPostsTable).set({ liveMisses: misses }).where(eq(winhousePromotionPostsTable.id, row.id));
      }
      continue;
    }

    const score = parseScoreline(live.resultRaw);

    if (row.status === "sent") {
      if (await transitionToLive(row, live, score, now)) edited++;
      continue;
    }

    // row.status === "live": edit only if the signature actually changed
    // and the throttle window has passed.
    const signature = buildLiveSignature(live);
    const changed = row.lastSignature !== signature;
    const throttleOk = !row.lastEditedAt || now.getTime() - row.lastEditedAt.getTime() >= minEditGapMs;

    if (changed && throttleOk) {
      if (await editLiveUpdate(row, live, score, now)) edited++;
    } else if (row.liveMisses !== 0) {
      // Reappeared in the live feed after one or more misses below the
      // confirm threshold — reset the counter without editing.
      await db.update(winhousePromotionPostsTable).set({ liveMisses: 0 }).where(eq(winhousePromotionPostsTable.id, row.id));
    }
  }

  return { activeChecked: active.length, edited, finished, deleted };
}
