import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDS_DIR = path.resolve(__dirname, "..", "..", "tmp", "feeds_reais_2026");
const CACHED_JSON = path.join(FEEDS_DIR, "v25c_BETBY_LIVE_EVENTS.json");

type BetbyBroadcast = { id: string; type: string; url: string };
type BetbyWidget = { id: string; type: string; url: string };
type BetbyEvent = {
  id: string;
  virtual: boolean;
  scheduled: number | null;
  sport: { id: string; name: string | null; slug: string | null };
  category: { id: string; name: string | null; country: string | null };
  tournament: { id: string; name: string | null; slug: string | null };
  home: { id: string; name: string | null; abbr: string | null };
  away: { id: string; name: string | null; abbr: string | null };
  state: { status: number | null; match_status: number | null; provider: string | null };
  score: any | null;
  broadcasts: BetbyBroadcast[];
  widgets: BetbyWidget[];
  _n: string;
};

type FeedDoc = {
  generated: number;
  source: Record<string, unknown>;
  stats: Record<string, number>;
  events: BetbyEvent[];
};

let doc: FeedDoc = { generated: 0, source: {}, stats: {}, events: [] };
let lastReloadAttemptMs = 0;

export function reloadFromDisk(): boolean {
  lastReloadAttemptMs = Date.now();
  try {
    if (!fs.existsSync(CACHED_JSON)) {
      logger.warn({ path: CACHED_JSON }, "[betby-live] cached feed not found — run probe v25c first");
      return false;
    }
    const raw = fs.readFileSync(CACHED_JSON, "utf8");
    doc = JSON.parse(raw) as FeedDoc;
    logger.info(
      { events: doc.events.length, stats: doc.stats, generated: new Date(doc.generated).toISOString() },
      "[betby-live] feed carregado do disco",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "[betby-live] falha ao carregar feed do disco");
    return false;
  }
}

reloadFromDisk();
setInterval(() => reloadFromDisk(), 5 * 60 * 1000);

function norm(s?: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function wordSet(s: string): Set<string> {
  return new Set(norm(s).split(/\s+/).filter((w) => w.length >= 2));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const uni = new Set([...a, ...b]).size || 1;
  return inter / uni;
}

const TOKEN_RX =
  /\b(fc|cf|ud|sc|ac|cd|afc|sad|ca|club|clube|de|do|da|dos|das|el|la|los|las|the|and|y|e|vs|sport|club|futbol|futebol|football|cf\.|f\.c\.|ac\.|s\.c\.|c\.a\.|c\.d\.)\b/gi;
function tokens(s?: string): string {
  return norm(s).replace(TOKEN_RX, " ").replace(/\s+/g, " ").trim();
}

export type FuzzyMatch = {
  event: BetbyEvent;
  score: number;
  homeScore: number;
  awayScore: number;
  swapped: boolean;
  tournamentScore: number;
  label: string;
};

/**
 * Faz fuzzy match de um jogo qualquer (home, away, tournament opcional) contra
 * todos eventos BETBY. Não é necessário match exato — a melhor correspondência
 * é retornada, desde que atinja um threshold.
 */
export function findBetbyEvent(params: {
  home: string;
  away: string;
  tournament?: string;
  sport?: "football" | "basketball" | "tennis" | "baseball" | "hockey" | null;
  minScore?: number;
  topN?: number;
}): FuzzyMatch[] {
  const { home, away, tournament, sport, minScore = 0.25, topN = 3 } = params;
  const events = sport
    ? doc.events.filter((e) =>
        sport === "football"
          ? e.sport.id === "1" || /soccer|football/i.test(e.sport.name ?? "")
          : sport === "basketball"
            ? e.sport.id === "2"
            : sport === "tennis"
              ? e.sport.id === "5"
              : sport === "baseball"
                ? e.sport.id === "3"
                : sport === "hockey"
                  ? e.sport.id === "4"
                  : true,
      )
    : doc.events;

  const tokensHome = tokens(home);
  const tokensAway = tokens(away);
  const setHome = wordSet(tokensHome || home);
  const setAway = wordSet(tokensAway || away);
  const setTour = tournament ? wordSet(tokens(tournament) || norm(tournament)) : null;

  const scored: FuzzyMatch[] = [];
  for (const ev of events) {
    const evH = tokens(ev.home.name ?? "");
    const evA = tokens(ev.away.name ?? "");
    const setH = wordSet(evH || norm(ev.home.name ?? ""));
    const setA = wordSet(evA || norm(ev.away.name ?? ""));
    // normal
    const hNorm = jaccard(setHome, setH);
    const aNorm = jaccard(setAway, setA);
    // swapped (provedor trocou ordem casa/visitante)
    const hSwap = jaccard(setHome, setA);
    const aSwap = jaccard(setAway, setH);
    const normal = 0.5 * hNorm + 0.5 * aNorm;
    const sw = 0.5 * hSwap + 0.5 * aSwap;
    const swapped = sw > normal;
    const homeScore = swapped ? hSwap : hNorm;
    const awayScore = swapped ? aSwap : aNorm;
    const teamScore = swapped ? sw : normal;

    let tournamentScore = 0;
    if (setTour) {
      const pool = [ev.tournament.name, ev.category.name, ev.category.country]
        .filter((x): x is string => !!x)
        .join(" ");
      tournamentScore = jaccard(setTour, wordSet(pool));
    }

    const total = teamScore * 0.8 + tournamentScore * 0.2;
    if (total < minScore) continue;
    const strong =
      total >= 0.7
        ? "MATCH_FORTE"
        : total >= 0.45
          ? "MATCH_MEDIO"
          : total >= minScore
            ? "MATCH_FRACO"
            : "SEM_MATCH";
    scored.push({
      event: ev,
      score: Number(total.toFixed(4)),
      homeScore: Number(homeScore.toFixed(4)),
      awayScore: Number(awayScore.toFixed(4)),
      swapped,
      tournamentScore: Number(tournamentScore.toFixed(4)),
      label: strong,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function getFeedDoc(): FeedDoc {
  return doc;
}
export function getAllEvents(): BetbyEvent[] {
  return doc.events;
}
export function getLastReload(): number {
  return lastReloadAttemptMs;
}
export function findEventById(id: string): BetbyEvent | null {
  return doc.events.find((e) => e.id === id) ?? null;
}
export type { BetbyEvent as BetbyLiveEvent, BetbyBroadcast, BetbyWidget };
