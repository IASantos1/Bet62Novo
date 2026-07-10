/**
 * Seção "Múltiplas Sugeridas" — exibida entre o card do jogo e as abas de mercados.
 * Busca /api/predictions/:matchId e lista os combos publicados.
 * Ao clicar em "Adicionar Múltipla", injeta as seleções no bet slip existente.
 */

import { useEffect, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type LegInfo = { code: string; label: string };

export type PublishedCombo = {
  id: string;
  title: string;
  category: string;
  legs: LegInfo[];
  odd: number;
};

type BetSelection = {
  matchId: string | number;
  matchTitle: string;
  league?: string;
  country?: string;
  sport?: string;
  date?: string;
  time?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  selection: string;
  odd: number;
  originalOdd: number;
  market: string;
  label: string;
  comboTag?: string;
};

type MatchInfo = {
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

type Props = {
  match: MatchInfo;
  bets: BetSelection[];
  setBets: React.Dispatch<React.SetStateAction<BetSelection[]>>;
  setBetMode: (mode: "simples" | "multipla") => void;
  setBetSlipOpenMobile: (open: boolean) => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  Favorito:       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Equilibrado:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Goleada:        "bg-red-500/15 text-red-400 border-red-500/30",
  "Primeiro Tempo":"bg-violet-500/15 text-violet-400 border-violet-500/30",
  "Segundo Tempo":"bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Escanteios:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function SuggestedCombos({
  match,
  bets,
  setBets,
  setBetMode,
  setBetSlipOpenMobile,
}: Props) {
  const [combos, setCombos] = useState<PublishedCombo[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!match?.id) return;
    let cancelled = false;
    setLoading(true);
    setCombos(null);
    fetch(`/api/predictions/${encodeURIComponent(String(match.id))}`)
      .then((r) => r.ok ? r.json() : { combos: [] })
      .then((data) => {
        if (!cancelled) setCombos(data.combos ?? []);
      })
      .catch(() => { if (!cancelled) setCombos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [match?.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 mb-2">
        <Loader2 size={13} className="animate-spin text-zinc-500" />
        <span className="text-[11px] text-zinc-500">A carregar sugestões…</span>
      </div>
    );
  }

  if (!combos || combos.length === 0) return null;

  const matchComboPrefix = `pred-${match.id}-`;

  const isComboActive = (combo: PublishedCombo) => {
    const tag = `${matchComboPrefix}${combo.id}`;
    return bets.some((b) => b.comboTag === tag);
  };

  const toggleCombo = (combo: PublishedCombo) => {
    const tag = `${matchComboPrefix}${combo.id}`;

    if (isComboActive(combo)) {
      setBets((prev) => prev.filter((b) => b.comboTag !== tag));
      return;
    }

    setBets((prev) => {
      // Remove any previous prediction combo from this match
      const withoutPrevious = prev.filter(
        (b) => !(b.comboTag && b.comboTag.startsWith(matchComboPrefix)),
      );
      const newSels: BetSelection[] = combo.legs.map((leg) => ({
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        league: match.league,
        country: match.country,
        sport: match.sport,
        date: match.date,
        time: match.time,
        scheduledDate: match.scheduledDate,
        scheduledTime: match.scheduledTime,
        selection: leg.code,
        odd: combo.odd / combo.legs.length, // placeholder — real combined odd on the card
        originalOdd: combo.odd / combo.legs.length,
        market: "prediction",
        label: leg.label,
        comboTag: tag,
      }));
      // Rewrite all new sels with the full combo odd on each (so slip shows correct total)
      const sels: BetSelection[] = combo.legs.map((leg) => ({
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        league: match.league,
        country: match.country,
        sport: match.sport,
        date: match.date,
        time: match.time,
        scheduledDate: match.scheduledDate,
        scheduledTime: match.scheduledTime,
        selection: `pred-${leg.code}`,
        odd: combo.odd,
        originalOdd: combo.odd,
        market: "prediction",
        label: `${combo.title}: ${leg.label}`,
        comboTag: tag,
      }));
      return [...withoutPrevious, ...sels];
    });
    setBetMode("multipla");
    if (window.innerWidth < 1024) setBetSlipOpenMobile(true);
  };

  return (
    <div className="mb-3 animate-in fade-in duration-200">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <Zap size={13} className="text-yellow-400 shrink-0" />
        <span className="text-[11px] font-black text-zinc-300 uppercase tracking-widest">
          Múltiplas Sugeridas
        </span>
        <span className="text-[10px] text-zinc-600 ml-auto">
          {combos.length} combo{combos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Horizontal scroll list */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
        <AnimatePresence>
          {combos.map((combo, idx) => {
            const active = isComboActive(combo);
            const catColor = CATEGORY_COLORS[combo.category] ?? "bg-zinc-700/30 text-zinc-400 border-zinc-600/30";

            return (
              <motion.div
                key={combo.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, delay: idx * 0.04 }}
                className={`snap-start shrink-0 w-[230px] rounded-xl border p-3 flex flex-col gap-2 transition-all ${
                  active
                    ? "bg-red-950/30 border-red-600/60 shadow-[0_0_10px_rgba(220,38,38,0.25)]"
                    : "bg-zinc-900/90 border-zinc-800/80"
                }`}
              >
                {/* Category badge + title */}
                <div className="flex items-start justify-between gap-1.5">
                  <span className={`text-[9px] font-black uppercase tracking-widest border rounded-full px-2 py-0.5 shrink-0 ${catColor}`}>
                    {combo.category}
                  </span>
                  <span className="text-[10px] font-black text-white leading-tight text-right">
                    {combo.title}
                  </span>
                </div>

                {/* Legs list */}
                <div className="space-y-0.5">
                  {combo.legs.map((leg) => (
                    <div key={leg.code} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                      <span className="text-[10px] text-zinc-400 leading-tight">{leg.label}</span>
                    </div>
                  ))}
                </div>

                {/* Odd + button */}
                <div className="flex items-center justify-between mt-auto pt-1 border-t border-zinc-800/60">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-600 uppercase tracking-wide">Odd</span>
                    <span className="text-[15px] font-black text-white tabular-nums">
                      {combo.odd.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleCombo(combo)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                      active
                        ? "bg-zinc-800 border border-red-500/60 text-red-400"
                        : "bg-gradient-to-r from-red-700 to-orange-600 text-white hover:from-red-600 hover:to-orange-500 active:opacity-80"
                    }`}
                  >
                    {active ? "✓ Adicionada" : "+ Adicionar"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <p className="text-[9px] text-zinc-700 px-1 mt-1.5 leading-relaxed">
        Combinações calculadas a partir das odds reais do jogo. Aposte de forma responsável.
      </p>
    </div>
  );
}
