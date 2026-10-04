import { escapeTelegramHtml } from "../../lib/telegram/client.js";
import type { WinHousePromotionGame } from "./parser.js";

// Football ticket format, user-specified (2026-10-04): 1x2 + "Ambas as
// Equipas Marcam" (BTS). Other sports get their own formatter later —
// this one is football-only, matching the step-by-step build (prove
// football end to end before generalizing to other sports).
export function formatWinHouseFootballTicket(game: WinHousePromotionGame): string {
  const home = escapeTelegramHtml(game.home_team);
  const away = escapeTelegramHtml(game.away_team);
  const time = game.date.split(" ")[1]?.slice(0, 5) ?? game.date;

  const lines: string[] = [];
  lines.push(`⚽ <b>${home} x ${away}</b>`);
  lines.push("");
  lines.push(`🕐 ${time}`);
  lines.push("");

  const { "1": home_odd, X: draw_odd, "2": away_odd } = game.markets;
  if (home_odd !== undefined || draw_odd !== undefined || away_odd !== undefined) {
    lines.push("🏆 <b>RESULTADO FINAL</b>");
    if (home_odd !== undefined) lines.push(`1️⃣ ${home} — ${home_odd.toFixed(2)}`);
    if (draw_odd !== undefined) lines.push(`🤝 Empate — ${draw_odd.toFixed(2)}`);
    if (away_odd !== undefined) lines.push(`2️⃣ ${away} — ${away_odd.toFixed(2)}`);
    lines.push("");
  }

  const { yes, no } = game.bothTeamsScore;
  if (yes !== undefined || no !== undefined) {
    lines.push("⚽ <b>AMBAS MARCAM</b>");
    if (yes !== undefined) lines.push(`✅ Sim — ${yes.toFixed(2)}`);
    if (no !== undefined) lines.push(`❌ Não — ${no.toFixed(2)}`);
    lines.push("");
  }

  lines.push("🔥 <b>Aposte na BET62</b>");
  return lines.join("\n");
}
