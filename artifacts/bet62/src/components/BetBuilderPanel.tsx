/**
 * BetBuilderPanel — Construtor de Same Game Combo / Bet Builder
 *
 * Permite ao utilizador selecionar 2 a 3 mercados do mesmo evento,
 * valida combinações contraditórias e calcula a odd combinada em tempo real
 * com ajuste de correlação (espelhando o motor do backend).
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, AlertTriangle, Plus, CheckCircle2, X } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────

export type BuilderMarket = {
  id: string;          // unique id used for conflict checks
  label: string;       // Portuguese display label
  market: string;      // bet slip market key
  selection: string;   // bet slip selection key
  odds: number;        // decimal odd
  category: string;    // section title
  conflictIds?: string[]; // IDs that cannot coexist with this market
};

type Props = {
  match: {
    id: string | number;
    home: string;
    away: string;
    league?: string;
    country?: string;
    sport?: string;
    date?: string;
    time?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  };
  markets: BuilderMarket[];
  bets: Array<Record<string, unknown>>;
  setBets: React.Dispatch<React.SetStateAction<any[]>>;
  setBetMode: (mode: "simples" | "multipla") => void;
  setBetSlipOpenMobile: (open: boolean) => void;
};

// ── Correlação (simplificada — espelha pricing.ts do backend) ─────────────

type PairRho = { a: string; b: string; rho: number };

const PAIR_RHOS: PairRho[] = [
  { a: "home",      b: "o25",    rho: 0.25 },
  { a: "home",      b: "o15",    rho: 0.30 },
  { a: "home",      b: "fg-h",   rho: 0.55 },
  { a: "home",      b: "ht-home",rho: 0.55 },
  { a: "home",      b: "hcp-1",  rho: 0.60 },
  { a: "home",      b: "h-o15",  rho: 0.45 },
  { a: "bts-yes",   b: "o25",    rho: 0.55 },
  { a: "bts-yes",   b: "o15",    rho: 0.45 },
  { a: "bts-yes",   b: "o35",    rho: 0.30 },
  { a: "o25",       b: "o15",    rho: 0.75 },
  { a: "o35",       b: "o25",    rho: 0.75 },
  { a: "bts-no",    b: "u25",    rho: 0.50 },
  { a: "ht-draw",   b: "home",   rho: 0.15 },
  { a: "cn-95",     b: "o25",    rho: 0.15 },
  { a: "cn-95",     b: "bts-yes",rho: 0.15 },
];

const MAX_LEGS = 3;

function getRho(a: string, b: string): number {
  for (const p of PAIR_RHOS) {
    if ((p.a === a && p.b === b) || (p.a === b && p.b === a)) return p.rho;
  }
  return 0;
}

function calcCombinedOdd(selected: BuilderMarket[]): number {
  if (selected.length < 2) return 0;
  const n = selected.length;

  // Implied fair probabilities (1/odd with ~6% margin strip)
  const probs = selected.map((m) => Math.min(0.97, 1 / m.odds));

  // Start with independent joint probability
  let joint = probs.reduce((acc, p) => acc * p, 1);

  // Pairwise correlation adjustments
  const numPairs = (n * (n - 1)) / 2;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pi = probs[i]!;
      const pj = probs[j]!;
      const rho = getRho(selected[i]!.id, selected[j]!.id);
      if (rho <= 0) continue;
      const indep = pi * pj;
      const adj   = (1 - rho) * indep + rho * Math.min(pi, pj);
      if (indep > 1e-9) {
        joint *= Math.pow(adj / indep, 1 / Math.max(1, numPairs));
      }
    }
  }

  joint = Math.min(0.97, Math.max(0.001, joint));
  const raw = 1 / (joint * 1.07); // 7% margin
  return Math.round(raw * 100) / 100;
}

// ── Conflito ──────────────────────────────────────────────────────────────

function findConflicts(
  selected: BuilderMarket[],
): Array<[BuilderMarket, BuilderMarket]> {
  const pairs: Array<[BuilderMarket, BuilderMarket]> = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i]!;
      const b = selected[j]!;
      if (a.conflictIds?.includes(b.id) || b.conflictIds?.includes(a.id)) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

// ── Ordenação lado a lado (mais/sim/casa à esquerda, menos/não/fora à
// direita) — espelha o layout das linhas de mercado na aba "Mercados" ──────

const KNOWN_PAIRS: Array<[string, string]> = [
  ["home", "away"],
  ["homeOrDraw", "awayOrDraw"],
  ["bts-yes", "bts-no"],
  ["ht-home", "ht-away"],
];

function orderForSideBySide(opts: BuilderMarket[]): BuilderMarket[] {
  const byId = new Map(opts.map((m) => [m.id, m]));
  const used = new Set<string>();
  const rows: BuilderMarket[][] = [];

  const takePair = (leftId: string, rightId: string) => {
    const l = byId.get(leftId);
    const r = byId.get(rightId);
    if (!l && !r) return;
    if (l) used.add(leftId);
    if (r) used.add(rightId);
    rows.push(l && r ? [l, r] : l ? [l] : [r!]);
  };

  for (const [leftId, rightId] of KNOWN_PAIRS) {
    if (byId.has(leftId) || byId.has(rightId)) takePair(leftId, rightId);
  }

  // Over/Under numeric pairs (o15/u15, o25/u25, o35/u35, ...)
  for (const m of opts) {
    if (used.has(m.id)) continue;
    const om = m.id.match(/^o(\d+)$/);
    if (om) takePair(m.id, `u${om[1]}`);
  }

  // Anything left over (draw, homeOrAway, ht-draw, escanteios, etc.) — one per row
  for (const m of opts) {
    if (used.has(m.id)) continue;
    used.add(m.id);
    rows.push([m]);
  }

  return rows.flat();
}

// ── Componente ────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  "Resultado":       "text-white",
  "Dupla Chance":    "text-emerald-400",
  "Total de Golos":  "text-orange-400",
  "Ambas Marcam":    "text-yellow-400",
  "Intervalo":       "text-violet-400",
  "Golos por Equipa":"text-pink-400",
  "Escanteios":      "text-cyan-400",
};

export default function BetBuilderPanel({
  match,
  markets,
  bets,
  setBets,
  setBetMode,
  setBetSlipOpenMobile,
}: Props) {
  const [selected, setSelected] = useState<BuilderMarket[]>([]);

  const conflicts = useMemo(() => findConflicts(selected), [selected]);
  const hasConflict = conflicts.length > 0;
  const combinedOdd = useMemo(() => calcCombinedOdd(selected), [selected]);

  // Category groups — dentro de cada categoria, mercados opostos (mais/menos,
  // sim/não, casa/fora) ficam lado a lado, com "positivo" à esquerda.
  const categories = useMemo(() => {
    const map = new Map<string, BuilderMarket[]>();
    for (const m of markets) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return Array.from(map.entries()).map(
      ([cat, opts]) => [cat, orderForSideBySide(opts)] as const,
    );
  }, [markets]);

  const toggle = (market: BuilderMarket) => {
    setSelected((prev) => {
      const already = prev.find((s) => s.id === market.id);
      if (already) return prev.filter((s) => s.id !== market.id);
      if (prev.length >= MAX_LEGS) return prev;
      return [...prev, market];
    });
  };

  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const isConflicting = (id: string) =>
    conflicts.some(([a, b]) => a.id === id || b.id === id);

  const comboTag = `builder-${match.id}-${Date.now()}`;
  const matchComboPrefix = `builder-${match.id}-`;

  const isActive = selected.length >= 2 &&
    !hasConflict &&
    bets.some(
      (b) => typeof b["comboTag"] === "string" && b["comboTag"].startsWith(matchComboPrefix) &&
        selected.every((s) =>
          bets.some(
            (bb) => bb["comboTag"] === b["comboTag"] &&
              bb["market"] === s.market &&
              bb["selection"] === s.selection,
          ),
        ),
    );

  const addToSlip = () => {
    if (selected.length < 2 || hasConflict) return;
    const tag = `builder-${match.id}-${Date.now()}`;
    setBets((prev) => {
      const cleaned = prev.filter(
        (b) => !(b.comboTag && b.comboTag.startsWith(matchComboPrefix)),
      );
      const legs = selected.map((s, idx) => ({
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        league: match.league,
        country: match.country,
        sport: match.sport,
        date: match.date,
        time: match.time,
        scheduledDate: (match as any).scheduledDate,
        scheduledTime: (match as any).scheduledTime,
        selection: s.selection,
        odd: idx === 0 ? combinedOdd : 1,
        originalOdd: idx === 0 ? combinedOdd : 1,
        market: s.market,
        label: `Combo: ${s.label}`,
        comboTag: tag,
      }));
      return [...cleaned, ...legs];
    });
    setBetMode("multipla");
    if (window.innerWidth < 1024) setBetSlipOpenMobile(true);
  };

  const clearAll = () => setSelected([]);

  return (
    <div className="animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-red-500 shrink-0" />
          <span className="text-[11px] font-black text-zinc-200 uppercase tracking-widest">
            Bet Builder
          </span>
          <span className="text-[9px] text-zinc-600 border border-zinc-700 rounded-full px-1.5 py-0.5 font-bold">
            Same Game Combo
          </span>
        </div>
        {selected.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={10} />
            Limpar
          </button>
        )}
      </div>

      {/* Market selector */}
      <div className="space-y-3">
        {categories.map(([cat, opts]) => (
          <div key={cat}>
            <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 px-0.5 ${CAT_COLORS[cat] ?? "text-zinc-500"}`}>
              {cat}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {opts.map((m) => {
                const sel = isSelected(m.id);
                const conflict = !sel && isConflicting(m.id);
                const disabled = !sel && selected.length >= MAX_LEGS;

                return (
                  <button
                    key={m.id}
                    onClick={() => !disabled && toggle(m)}
                    disabled={disabled}
                    className={`flex flex-col items-center justify-center min-w-0 h-[58px] px-1 rounded-xl border transition-all ${
                      sel
                        ? "border-red-500 bg-red-600/20 shadow-sm shadow-red-900/30"
                        : conflict
                        ? "bg-zinc-900/40 border-red-900/50 opacity-40 cursor-not-allowed"
                        : disabled
                        ? "bg-zinc-900/30 border-zinc-800/40 opacity-30 cursor-not-allowed"
                        : "border-zinc-700/60 bg-zinc-800/80 hover:border-zinc-600 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="text-[10px] text-zinc-500 mb-1 leading-tight text-center truncate w-full px-0.5">
                      {m.label}
                    </span>
                    <span
                      className={`text-sm font-black leading-none tabular-nums ${
                        sel ? "text-red-400" : "text-white"
                      }`}
                    >
                      {m.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Conflict warning */}
      <AnimatePresence>
        {hasConflict && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2.5"
          >
            <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] font-black text-red-400 mb-0.5">
                Combinação contraditória
              </div>
              {conflicts.map(([a, b], i) => (
                <div key={i} className="text-[9px] text-red-300/70">
                  "{a.label}" não pode combinar com "{b.label}"
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected legs + combined odds */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mt-3 rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden"
          >
            {/* Legs */}
            <div className="p-3 space-y-1.5">
              {selected.map((s) => {
                const conflict = isConflicting(s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {conflict
                        ? <AlertTriangle size={9} className="text-red-400 shrink-0" />
                        : <CheckCircle2 size={9} className="text-emerald-500 shrink-0" />
                      }
                      <span className={`text-[10px] leading-tight truncate ${conflict ? "text-red-400" : "text-zinc-300"}`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-black text-zinc-200 tabular-nums">
                        {s.odds.toFixed(2)}
                      </span>
                      <button
                        onClick={() => toggle(s)}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Combined odds bar */}
            {selected.length >= 2 && !hasConflict && (
              <div className="border-t border-zinc-800/60 px-3 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">
                    Odd Combinada
                  </div>
                  <div className="text-[20px] font-black text-white leading-none tabular-nums">
                    {combinedOdd.toFixed(2)}
                  </div>
                  <div className="text-[8px] text-zinc-600 mt-0.5">
                    {selected.length} seleç{selected.length === 1 ? "ão" : "ões"} · cor. correlação aplicada
                  </div>
                </div>
                <button
                  onClick={addToSlip}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500 active:opacity-80 text-white text-[11px] font-black px-3 py-2 rounded-xl transition-all shadow-[0_2px_8px_rgba(239,68,68,0.35)]"
                >
                  <Plus size={12} />
                  Adicionar
                </button>
              </div>
            )}

            {selected.length < 2 && (
              <div className="border-t border-zinc-800/60 px-3 py-2 text-[9px] text-zinc-600">
                Seleciona pelo menos 2 mercados para construir o combo
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {selected.length === 0 && (
        <p className="text-[9px] text-zinc-700 mt-3 px-0.5 leading-relaxed">
          Escolhe 2 a 3 mercados para construir o teu próprio combo. Combinações contraditórias são sinalizadas automaticamente.
        </p>
      )}
    </div>
  );
}
