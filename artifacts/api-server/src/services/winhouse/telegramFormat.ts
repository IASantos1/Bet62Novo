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
// not a custom graphic.
export function formatWinHouseFootballTicket(game: WinHousePromotionGame, ctaUrl: string): WinHouseFootballTicket {
  const home = escapeTelegramHtml(game.home_team);
  const away = escapeTelegramHtml(game.away_team);
  const time = game.date.split(" ")[1]?.slice(0, 5) ?? game.date;

  const lines: string[] = [];
  lines.push(`⚽ <b>${home} x ${away}</b>`);
  lines.push("");
  lines.push(`🕐 ${time}`);

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
