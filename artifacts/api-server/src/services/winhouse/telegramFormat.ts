import { escapeTelegramHtml } from "../../lib/telegram/client.js";
import type { WinHousePromotionGame } from "./parser.js";
import { getCountryFlag } from "./teamFlags.js";

export type TelegramInlineButton = { text: string; url: string };

export type WinHouseFootballTicket = {
  html: string;
  // Rows of buttons, in the order they should appear — a real Telegram
  // inline keyboard, not a custom shape (the platform doesn't support
  // custom button shapes/colors/images). Every button links to the same
  // ctaUrl: WinHouse gives no confirmed way to deep-link into one specific
  // market, so "which odd you tapped" only decides the button's label,
  // not its destination.
  keyboard: TelegramInlineButton[][];
};

// User-approved design (2026-10-05): message keeps the section headers
// (teams, kickoff, "RESULTADO FINAL", "AMBAS MARCAM") as text; the odds
// themselves move into real Telegram inline-keyboard buttons instead of
// plain text lines, one row per market, plus a final CTA row — this is
// the standard Telegram button shape (rounded, spaced, system-rendered),
// not a custom graphic. league, when given, is the real competition name
// already confirmed from the 24h list endpoint (the same field the league
// filter matches on) — never guessed or looked up separately.
export function formatWinHouseFootballTicket(
  game: WinHousePromotionGame,
  ctaUrl: string,
  league?: string,
): WinHouseFootballTicket {
  const home = escapeTelegramHtml(game.home_team);
  const away = escapeTelegramHtml(game.away_team);
  // game.date is WinHouse's confirmed "YYYY-MM-DD HH:mm:ss" format — split
  // straight on "-"/":" rather than parsing as a Date, same reasoning as
  // the scheduler's string-sort: no timezone is confirmed for this feed,
  // so this never goes through Date math, only reformats the digits.
  const [datePart, timePart] = game.date.split(" ");
  const [year, month, day] = datePart?.split("-") ?? [];
  const date = day && month && year ? `${day}/${month}/${year}` : datePart ?? "";
  const time = timePart?.slice(0, 5) ?? "";

  const lines: string[] = [];
  lines.push(`⚽ <b>${home} x ${away}</b>`);
  if (league) lines.push(`🏟️ <i>${escapeTelegramHtml(league)}</i>`);
  lines.push("");
  lines.push(`📅 ${date} 🕐 ${time}`);

  const keyboard: TelegramInlineButton[][] = [];

  // Only ever set for an exact national-team name match — null (no flag)
  // for every club team, since we have no reliable club-badge source.
  const homeFlag = getCountryFlag(game.home_team);
  const awayFlag = getCountryFlag(game.away_team);

  const { "1": home_odd, X: draw_odd, "2": away_odd } = game.markets;
  if (home_odd !== undefined || draw_odd !== undefined || away_odd !== undefined) {
    lines.push("");
    lines.push("🏆 <b>RESULTADO FINAL</b>");
    const row: TelegramInlineButton[] = [];
    if (home_odd !== undefined) {
      row.push({ text: `${homeFlag ? homeFlag + " " : ""}${game.home_team} ${home_odd.toFixed(2)}`, url: ctaUrl });
    }
    if (draw_odd !== undefined) {
      row.push({ text: `Empate ${draw_odd.toFixed(2)}`, url: ctaUrl });
    }
    if (away_odd !== undefined) {
      row.push({ text: `${awayFlag ? awayFlag + " " : ""}${game.away_team} ${away_odd.toFixed(2)}`, url: ctaUrl });
    }
    keyboard.push(row);
  }

  const { yes, no } = game.bothTeamsScore;
  if (yes !== undefined || no !== undefined) {
    lines.push("");
    lines.push("⚽ <b>AMBAS MARCAM</b>");
    const row: TelegramInlineButton[] = [];
    if (yes !== undefined) row.push({ text: `✅ Sim ${yes.toFixed(2)}`, url: ctaUrl });
    if (no !== undefined) row.push({ text: `❌ Não ${no.toFixed(2)}`, url: ctaUrl });
    keyboard.push(row);
  }

  keyboard.push([{ text: "🔥 APOSTAR AGORA", url: ctaUrl }]);

  return { html: lines.join("\n"), keyboard };
}

// PREMATCH -> LIVE -> FINISHED -> DELETE lifecycle (2026-10-05): once a
// fixture appears in /ajax/livegames, the original message is edited in
// place (never re-sent) to show this instead. Built straight from the
// posts-table row's own home/away/league — no re-fetch of the prematch
// odds needed, and the original inline keyboard is left untouched by the
// caller (editMessageText without reply_markup keeps it as-is).
export function formatWinHouseLiveFootballTicket(
  game: { homeTeam: string; awayTeam: string; league: string },
  score: { home: number; away: number } | null,
  minute: string | null,
): string {
  const home = escapeTelegramHtml(game.homeTeam);
  const away = escapeTelegramHtml(game.awayTeam);

  const lines: string[] = [];
  lines.push("🔴 <b>AO VIVO</b>");
  lines.push("");
  lines.push(`⚽ <b>${home} x ${away}</b>`);
  if (game.league) lines.push(`🏟️ <i>${escapeTelegramHtml(game.league)}</i>`);
  lines.push("");
  // Either field can be unavailable if the live feed's real field names
  // turn out to differ from the guesses in liveGame.ts — shown only when
  // actually found, never a fabricated placeholder.
  if (minute) lines.push(`⏱ ${escapeTelegramHtml(minute)}'`);
  if (score) lines.push(`📊 ${score.home} - ${score.away}`);

  return lines.join("\n");
}

// FINISHED: shows the last known score (passed in by the caller — either
// just parsed this tick, or the row's previously stored score if the
// fixture had already dropped off /ajax/livegames by the time this fires).
// The caller removes the bet button separately (removeKeyboard on the
// editMessageText call) since betting on a finished fixture makes no sense.
export function formatWinHouseFinishedFootballTicket(
  game: { homeTeam: string; awayTeam: string; league: string },
  score: { home: number; away: number } | null,
): string {
  const home = escapeTelegramHtml(game.homeTeam);
  const away = escapeTelegramHtml(game.awayTeam);

  const lines: string[] = [];
  lines.push("✅ <b>FINALIZADO</b>");
  lines.push("");
  lines.push(score ? `⚽ <b>${home} ${score.home} x ${score.away} ${away}</b>` : `⚽ <b>${home} x ${away}</b>`);
  if (game.league) lines.push(`🏟️ <i>${escapeTelegramHtml(game.league)}</i>`);
  lines.push("");
  lines.push("🏁 Resultado final");

  return lines.join("\n");
}
